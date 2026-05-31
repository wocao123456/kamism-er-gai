use redis::AsyncCommands;
use sha2::Digest;
use rand::Rng;
pub mod db;
pub mod middleware;
pub mod models;
pub mod routes;
pub mod utils;
mod workers;

use dotenvy::dotenv;
use std::env;
use std::sync::Arc;
use axum::http::Method;
use tower_http::cors::{Any, CorsLayer};
use tower_http::compression::CompressionLayer;
use tower_http::limit::RequestBodyLimitLayer;
use axum::middleware as axum_middleware;
use crate::middleware::auth::AppState;
use crate::middleware::op_log::op_log_middleware;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[cfg(feature = "desktop")]
#[tauri::command]
fn get_api_url() -> String {
    option_env!("API_URL").unwrap_or("http://localhost:9527").to_string()
}

#[cfg(feature = "desktop")]
pub fn run() {
    let _ = dotenv();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_api_url])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用失败");
}

pub async fn start_server() -> anyhow::Result<()> {
    let _ = dotenv();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let database_url = env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:password@localhost/kamism".to_string());
    let jwt_secret = env::var("JWT_SECRET")
        .unwrap_or_else(|_| "kamism-super-secret-key-change-in-production".to_string());
    let redis_url = env::var("REDIS_URL")
        .unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    let amqp_url = env::var("AMQP_URL")
        .unwrap_or_else(|_| "amqp://guest:guest@localhost:5672/%2f".to_string());
    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(9527);

    tracing::info!("正在连接数据库...");
    let pool = db::create_pool(&database_url).await?;
    tracing::info!("数据库连接成功");

    db::run_migrations(&pool).await?;
    tracing::info!("数据库迁移完成");

    tracing::info!("正在连接 Redis...");
    let redis_client = redis::Client::open(redis_url.as_str())?;
    let redis_conn = redis::aio::ConnectionManager::new(redis_client).await?;
    tracing::info!("Redis 连接成功");

    tracing::info!("正在连接 RabbitMQ...");
    let mq_channel = utils::mq::connect(&amqp_url).await?;
    let mq_channel = Arc::new(mq_channel);
    tracing::info!("RabbitMQ 连接成功");

    tracing::info!("正在初始化 KMS...");
    let kms = utils::kms::KmsManager::new()?;
    let encryptor = Arc::new(utils::kms::Encryptor::new(kms));
    tracing::info!("KMS 初始化成功");

    init_admin(&pool, &encryptor).await;
    let ws_registry = crate::utils::ws::WsRegistry::new();
    let state = AppState {
        pool: pool.clone(),
        jwt_secret: jwt_secret.clone(),
        mailer: crate::utils::mailer::MailerConfig::from_env(),
        redis: redis_conn.clone(),
        mq_channel: mq_channel.clone(),
        encryptor: encryptor.clone(),
        ws_registry: ws_registry.clone(),
    };

    let worker_pool = pool.clone();
    let worker_channel = (*mq_channel).clone();
    let worker_redis = redis_conn.clone();
    tokio::spawn(async move {
        workers::downgrade::run_downgrade_worker(worker_pool, worker_channel, worker_redis).await;
    });

    let upgrade_pool = pool.clone();
    let upgrade_channel = (*mq_channel).clone();
    let upgrade_redis = redis_conn.clone();
    tokio::spawn(async move {
        workers::downgrade::run_upgrade_worker(upgrade_pool, upgrade_channel, upgrade_redis).await;
    });

    let scanner_pool = pool.clone();
    let scanner_channel = mq_channel.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));
        loop { interval.tick().await; scan_and_enqueue(&scanner_pool, &scanner_channel).await; }
    });

    // 风控自动解封：每30���清理到期黑名单
    let unblock_pool = pool.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
        loop {
            interval.tick().await;
            let now = chrono::Utc::now();
            let _ = sqlx::query("DELETE FROM ip_blacklist WHERE blocked_until IS NOT NULL AND blocked_until <= $1").bind(now).execute(&unblock_pool).await;
            let _ = sqlx::query("DELETE FROM device_blacklist WHERE blocked_until IS NOT NULL AND blocked_until <= $1").bind(now).execute(&unblock_pool).await;
        }
    });

    // 每6小时清理过期日志 (operation_logs保留7天)
    let log_clean_pool = pool.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(21600));
        loop {
            interval.tick().await;
            let cutoff_7d = chrono::Utc::now() - chrono::Duration::days(7);
            let cutoff_24h = chrono::Utc::now() - chrono::Duration::hours(24);
            let _ = sqlx::query("DELETE FROM operation_logs WHERE created_at < $1").bind(cutoff_7d).execute(&log_clean_pool).await;
            let _ = sqlx::query("DELETE FROM activation_alerts WHERE created_at < $1").bind(cutoff_24h).execute(&log_clean_pool).await;
            let _ = sqlx::query("DELETE FROM api_call_logs WHERE created_at < $1").bind(cutoff_24h).execute(&log_clean_pool).await;
        }
    });

    let clean_pool = pool.clone();
    let clean_redis = redis_conn.clone();
    tokio::spawn(async move {
        loop {
            let now = chrono::Utc::now();
            let next_midnight = (now + chrono::Duration::days(1)).date_naive().and_hms_opt(0,0,0).unwrap();
            let next_midnight = chrono::DateTime::from_naive_utc_and_offset(next_midnight, chrono::Utc);
            let wait_secs = (next_midnight - now).num_seconds().max(60) as u64;
            tokio::time::sleep(tokio::time::Duration::from_secs(wait_secs)).await;
            let mut conn = clean_redis.clone();
            let k1: Vec<String> = conn.keys("ts:*".to_string()).await.unwrap_or_default();
            for k in k1 { let _: () = conn.del(&k).await.unwrap_or(()); }
            let k2: Vec<String> = conn.keys("ts_used:*".to_string()).await.unwrap_or_default();
            for k in k2 { let _: () = conn.del(&k).await.unwrap_or(()); }
            tracing::info!("凌晨清空: Redis 鉴权密钥已清理");
            let _ = sqlx::query("DELETE FROM api_call_logs").execute(&clean_pool).await;
            tracing::info!("凌晨清空: api_call_logs 表已清理");
        }
    });

    let allowed_origin = env::var("ALLOWED_ORIGIN").unwrap_or_default();
    let cors = if allowed_origin.is_empty() {
        CorsLayer::new().allow_origin(Any).allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE, Method::OPTIONS]).allow_headers(Any)
    } else {
        use axum::http::HeaderValue;
        let origin = allowed_origin.parse::<HeaderValue>().unwrap_or_else(|_| HeaderValue::from_static("*"));
        CorsLayer::new().allow_origin(origin).allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE, Method::OPTIONS]).allow_headers(Any)
    };

    routes::health::init_start_time();

    let app = axum::Router::new()
        .merge(routes::health::health_router())
        .merge(routes::auth::auth_router(state.clone()))
        .merge(routes::admin::admin_router_with_state(state.clone()))
        .merge(routes::merchant::merchant_router(state.clone()))
        .merge(routes::apps::apps_router(state.clone()))
        .merge(routes::cards::cards_router(state.clone()))
        .merge(routes::activations::activations_router(state.clone()))
        .merge(routes::public_api::public_api_router(state.clone()))
        .merge(routes::plan_config::plan_config_router(state.clone()))
        .merge(routes::messages::messages_admin_router(state.clone()))
        .merge(routes::messages::messages_merchant_router(state.clone()))
        .merge(routes::messages::messages_ws_router())
        .merge(routes::webhooks::webhooks_router(state.clone()))
        .merge(routes::blacklist::blacklist_router(state.clone()))
        .merge(routes::agent::agent_router(state.clone()))
        .merge(routes::oauth::oauth_router(state.clone()))
        .merge(routes::profile::profile_router(state.clone()))
        .merge(routes::system_update::system_update_router(state.clone()))
        .nest("/api/keys", routes::api_keys::api_keys_router(state.clone()))
        .nest("/api/ts", routes::api_ts::api_ts_router(state.clone()))
        .layer(axum_middleware::from_fn_with_state(state.clone(), op_log_middleware))
        .layer(axum_middleware::from_fn(middleware::security::security_headers))
        .layer(CompressionLayer::new())
        .layer(RequestBodyLimitLayer::new(2 * 1024 * 1024))
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    tracing::info!("KamiSM 服务器已启动，监听端口: {}", port);
    axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>()).await?;
    Ok(())
}

async fn scan_and_enqueue(pool: &db::DbPool, channel: &Arc<lapin::Channel>) {
    let expired: Vec<(uuid::Uuid,)> = sqlx::query_as(
        "SELECT id FROM merchants WHERE plan = 'pro' AND plan_expires_at IS NOT NULL AND plan_expires_at <= NOW()",
    ).fetch_all(pool).await.unwrap_or_default();
    for (merchant_id,) in expired {
        if let Err(e) = utils::mq::publish_downgrade(channel, &merchant_id.to_string()).await {
            tracing::error!("发布降级消息失败 {}: {}", merchant_id, e);
        } else {
            tracing::info!("已发布降级消息: 商户 {}", merchant_id);
        }
    }
}

async fn init_admin(pool: &db::DbPool, encryptor: &Arc<utils::kms::Encryptor>) {
    let exists: Option<(String,)> = sqlx::query_as("SELECT id::text FROM admins LIMIT 1").fetch_optional(pool).await.unwrap_or(None);
    if exists.is_none() {
        let admin_email = env::var("ADMIN_EMAIL").unwrap_or_else(|_| "admin@kamism.com".to_string());
        let admin_password = env::var("ADMIN_PASSWORD").unwrap_or_else(|_| "Admin@123456".to_string());
        let password_hash = bcrypt::hash(&admin_password, bcrypt::DEFAULT_COST).unwrap();
        let _ = sqlx::query("INSERT INTO admins (username, email, password_hash) VALUES ($1, $2, $3)").bind("admin").bind(&admin_email).bind(&password_hash).execute(pool).await;
        tracing::info!("初始管理员账号已创建: {}", admin_email);
    }
    // 不再自动生成 admin@kamism.local 影子商户账号；管理员商户上下文由业务按当前 admin.id 兜底重建。
}
