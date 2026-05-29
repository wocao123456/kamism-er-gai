//! 对外公开 API，供第三方软件调用（使用 api_key 鉴权，无需 JWT）

use redis::AsyncCommands;
use crate::{
    db::encrypted_fields::EncryptedFieldsOps,
    middleware::auth::AppState,
    models::{activation::Activation, card::Card},
};
use axum::{
    extract::{ConnectInfo, State},
    http::HeaderMap,
    routing::post,
    Json, Router,
};
use chrono::{Duration, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::SocketAddr;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct ActivateRequest {
    pub api_key: String,
    pub app_id: Uuid,
    pub card_code: String,
    pub device_id: String,
    pub device_name: Option<String>,
}

#[derive(Deserialize)]
pub struct VerifyRequest {
    pub api_key: String,
    pub app_id: Uuid,
    pub card_code: String,
    pub device_id: String,
}

#[derive(Deserialize)]
pub struct UnbindRequest {
    pub api_key: String,
    pub app_id: Uuid,
    pub card_code: String,
    pub device_id: String,
}

#[derive(Deserialize)]
pub struct HeartbeatRequest {
    pub api_key: String,
    pub device_id: String,
    pub device_name: Option<String>,
}

fn extract_client_ip(headers: &HeaderMap, addr: &SocketAddr) -> String {
    if let Some(val) = headers.get("x-forwarded-for") {
        if let Ok(s) = val.to_str() {
            let first = s.split(',').next().unwrap_or("").trim();
            if !first.is_empty() {
                return first.to_string();
            }
        }
    }
    if let Some(val) = headers.get("x-real-ip") {
        if let Ok(s) = val.to_str() {
            let s = s.trim();
            if !s.is_empty() {
                return s.to_string();
            }
        }
    }
    addr.ip().to_string()
}

async fn get_risk_setting(pool: &sqlx::PgPool, key: &str, default: Value) -> Value {
    let row: Option<(Value,)> = sqlx::query_as("SELECT value FROM risk_settings WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);
    row.map(|(v,)| v).unwrap_or(default)
}

async fn write_alert(pool: &sqlx::PgPool, merchant_id: Uuid, alert_type: &str, device_hint: &str, ip: &str, detail: &str) {
    let _ = sqlx::query(
        "INSERT INTO activation_alerts (merchant_id, alert_type, device_hint, ip_address, detail) VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(merchant_id)
    .bind(alert_type)
    .bind(device_hint)
    .bind(ip)
    .bind(detail)
    .execute(pool)
    .await;
}

async fn write_block(pool: &sqlx::PgPool, merchant_id: Uuid, tp: &str, hash_val: &str, limit: i64, device_id: &str) {
    // 查询当前是否还在封禁期内
    let now = Utc::now();
    let is_currently_blocked: bool = if tp == "ip" {
        sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM ip_blacklist WHERE ip=$1 AND blocked_until > NOW()"
        )
        .bind(hash_val)
        .fetch_one(pool)
        .await
        .map(|(c,)| c > 0)
        .unwrap_or(false)
    } else {
        sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM device_blacklist WHERE device_id_hash=$1 AND blocked_until > NOW()"
        )
        .bind(hash_val)
        .fetch_one(pool)
        .await
        .map(|(c,)| c > 0)
        .unwrap_or(false)
    };

    // 如果已在封禁期内，不更新时间，不增加计数
    if is_currently_blocked {
        return;
    }

    // 查询历史违规次数（从黑名单表统计，包括已过期的记录）
    let violation_count: i64 = if tp == "ip" {
        sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM ip_blacklist WHERE ip=$1"
        )
        .bind(hash_val)
        .fetch_one(pool)
        .await
        .unwrap_or((0,))
        .0
    } else {
        sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM device_blacklist WHERE device_id_hash=$1"
        )
        .bind(hash_val)
        .fetch_one(pool)
        .await
        .unwrap_or((0,))
        .0
    };

    // 阶梯时间：第1次10分钟，第2次20分钟，第3次40分钟... 封顶1440分钟
    let minutes = match violation_count + 1 {
        1 => 10,
        2 => 20,
        3 => 40,
        4 => 60,
        5 => 120,
        6 => 240,
        7 => 480,
        _ => 1440,
    };
    let until = now + Duration::minutes(minutes as i64);

    if tp == "ip" {
        let _ = sqlx::query(
            "INSERT INTO ip_blacklist (merchant_id, ip, reason, blocked_until)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (COALESCE(merchant_id::text, 'global'::text), ip)
             DO UPDATE SET reason = $3, blocked_until = $4"
        )
        .bind(merchant_id)
        .bind(hash_val)
        .bind(format!("触发频率限制 {}次/分，第{}次违规", limit, violation_count + 1))
        .bind(until)
        .execute(pool)
        .await;
    } else {
        let device_hint = if device_id.len() >= 4 {
            format!("{}****", &device_id[..4])
        } else {
            "****".to_string()
        };
        let _ = sqlx::query(
            "INSERT INTO device_blacklist (merchant_id, device_id_hash, device_hint, reason, blocked_until)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (COALESCE(merchant_id::text, 'global'::text), device_id_hash)
             DO UPDATE SET reason = $4, blocked_until = $5"
        )
        .bind(merchant_id)
        .bind(hash_val)
        .bind(&device_hint)
        .bind(format!("卡密超限 {}次/分，第{}次违规", limit, violation_count + 1))
        .bind(until)
        .execute(pool)
        .await;
    }
}

async fn check_blocked(state: &AppState, ip: &str, device_id: &str) -> Option<Json<Value>> {
    let device_id_hash = EncryptedFieldsOps::generate_hash(device_id);
    let now = Utc::now();

    // 白名单跳过
    let wip: Option<(i64,)> = sqlx::query_as("SELECT 1 FROM whitelist WHERE type='ip' AND value=$1 LIMIT 1")
        .bind(ip)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);
    let wdev: Option<(i64,)> = sqlx::query_as("SELECT 1 FROM whitelist WHERE type='device' AND value=$1 LIMIT 1")
        .bind(&device_id_hash)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);
    if wip.is_some() && wdev.is_some() {
        return None;
    }

    if wip.is_none() {
        let r: Option<(String, Option<chrono::DateTime<chrono::Utc>>)> = sqlx::query_as(
            "SELECT reason, blocked_until FROM ip_blacklist WHERE ip=$1 AND (blocked_until IS NULL OR blocked_until > NOW()) LIMIT 1"
        )
        .bind(ip)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);
        if let Some((reason, until)) = r {
            let remaining = until.map(|b| (b - now).num_seconds().max(0)).unwrap_or(0);
            return Some(Json(json!({
                "success": false,
                "message": "IP已被封禁",
                "data": { "remaining_seconds": remaining, "reason": reason }
            })));
        }
    }

    if wdev.is_none() {
        let r: Option<(String, Option<chrono::DateTime<chrono::Utc>>)> = sqlx::query_as(
            "SELECT reason, blocked_until FROM device_blacklist WHERE device_id_hash=$1 AND (blocked_until IS NULL OR blocked_until > NOW()) LIMIT 1"
        )
        .bind(&device_id_hash)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);
        if let Some((reason, until)) = r {
            let remaining = until.map(|b| (b - now).num_seconds().max(0)).unwrap_or(0);
            return Some(Json(json!({
                "success": false,
                "message": "设备已被封禁",
                "data": { "remaining_seconds": remaining, "reason": reason }
            })));
        }
    }
    None
}

async fn check_card_rate(state: &AppState, merchant_id: Uuid, card_code: &str, ip: &str, device_id: &str) -> Option<Json<Value>> {
    let settings = get_risk_setting(&state.pool, "rate_verify", json!({"card_warn": 3, "card_block": 5})).await;
    let warn_limit = settings["card_warn"].as_i64().unwrap_or(3);
    let block_limit = settings["card_block"].as_i64().unwrap_or(5);

    let card_hash = EncryptedFieldsOps::generate_hash(card_code);
    let key = format!("rate:card:{}", card_hash);
    let mut r = state.redis.clone();
    let count: i64 = redis::AsyncCommands::incr(&mut r, &key, 1).await.unwrap_or(0);
    if count == 1 {
        let _: () = redis::AsyncCommands::expire(&mut r, &key, 60).await.unwrap_or(());
    }

    if count >= warn_limit && count < block_limit {
        write_alert(
            &state.pool,
            merchant_id,
            "rate_warn",
            card_code,
            "system",
            &format!("卡密1分钟{}次，接近限制{}", count, warn_limit),
        ).await;
    }

    if count >= block_limit {
        write_alert(
            &state.pool,
            merchant_id,
            "card_rate_block",
            card_code,
            "system",
            &format!("卡密1分钟{}次，超限{}次，已封禁", count, block_limit),
        ).await;
        write_block(&state.pool, merchant_id, "card", &card_hash, block_limit, device_id).await;

        let _ip_hash = EncryptedFieldsOps::generate_hash(ip);
        write_block(&state.pool, merchant_id, "ip", ip, block_limit, device_id).await;

        return Some(Json(json!({
            "success": false,
            "message": "请求超限已被封禁",
            "data": { "count": count, "limit": block_limit, "remaining_seconds": 600 }
        })));
    }
    None
}

async fn heartbeat(
    State(state): State<AppState>,
    Json(body): Json<HeartbeatRequest>,
) -> Json<Value> {
    let device_id_hash = EncryptedFieldsOps::generate_hash(&body.device_id);
    let now = Utc::now();
    let settings = get_risk_setting(&state.pool, "heartbeat", json!({"interval": 30, "timeout": 180})).await;
    let _timeout_secs = settings["timeout"].as_i64().unwrap_or(180);

    let existing: Option<(i32, i32, String)> = sqlx::query_as(
        "SELECT consecutive_failures, consecutive_successes, status FROM device_heartbeats WHERE device_id_hash = $1 LIMIT 1"
    )
    .bind(&device_id_hash)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    match existing {
        None => {
            let _ = sqlx::query(
                "INSERT INTO device_heartbeats (device_id_hash, last_heartbeat, status, consecutive_successes) VALUES ($1, NOW(), 'online', 1)"
            )
            .bind(&device_id_hash)
            .execute(&state.pool)
            .await;
        }
        Some((_, _successes, status)) => {
            if status == "blocked" {
                let blocked: Option<(chrono::DateTime<chrono::Utc>,)> = sqlx::query_as(
                    "SELECT last_blocked_until FROM device_heartbeats WHERE device_id_hash = $1"
                )
                .bind(&device_id_hash)
                .fetch_optional(&state.pool)
                .await
                .unwrap_or(None);

                if let Some((until,)) = blocked {
                    if now > until {
                        let _ = sqlx::query(
                            "UPDATE device_heartbeats SET status='online', consecutive_failures=0, consecutive_successes=1, last_heartbeat=NOW() WHERE device_id_hash=$1"
                        )
                        .bind(&device_id_hash)
                        .execute(&state.pool)
                        .await;
                        let _ = sqlx::query("DELETE FROM device_blacklist WHERE device_id_hash=$1")
                            .bind(&device_id_hash)
                            .execute(&state.pool)
                            .await;
                    } else {
                        return Json(json!({
                            "success": false,
                            "message": "设备已被封禁",
                            "data": { "remaining_seconds": (until - now).num_seconds() }
                        }));
                    }
                }
            }
            let _ = sqlx::query(
                "UPDATE device_heartbeats SET last_heartbeat=NOW(), consecutive_successes=consecutive_successes+1, consecutive_failures=0, status='online' WHERE device_id_hash=$1"
            )
            .bind(&device_id_hash)
            .execute(&state.pool)
            .await;
        }
    }
    Json(json!({"success": true, "message": "心跳已记录", "status": "online"}))
}

pub fn public_api_router(state: AppState) -> Router<AppState> {
    use crate::middleware::rate_limit::{api_rate_limit, activate_rate_limit};
    use axum::middleware;
    Router::new()
        .route("/v1/activate", post(activate).route_layer(
            middleware::from_fn_with_state(state.clone(), activate_rate_limit)
        ))
        .route("/v1/verify", post(verify))
        .route("/v1/unbind", post(unbind))
        .route("/v1/heartbeat", post(heartbeat))
        .route_layer(middleware::from_fn_with_state(state, api_rate_limit))
}

async fn activate(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<ActivateRequest>,
) -> Json<Value> {
    if body.device_id.trim().is_empty() {
        return Json(json!({"success": false, "message": "设备ID不能为空"}));
    }

    let ip = extract_client_ip(&headers, &addr);

    let api_key_hash = EncryptedFieldsOps::generate_hash(&body.api_key);
    let merchant: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM merchants WHERE api_key_hash = $1 AND status = 'active'")
            .bind(&api_key_hash)
            .fetch_optional(&state.pool)
            .await
            .unwrap_or(None);
    let merchant_id = match merchant {
        Some((id,)) => id,
        None => return Json(json!({"success": false, "message": "无效的 API Key"})),
    };

    if let Some(blocked) = check_blocked(&state, &ip, &body.device_id).await {
        return blocked;
    }
    if let Some(rate) = check_card_rate(&state, merchant_id, &body.card_code, &ip, &body.device_id).await {
        return rate;
    }

    let app_valid: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM apps WHERE id = $1 AND merchant_id = $2 AND status = 'active'",
    )
    .bind(body.app_id)
    .bind(merchant_id)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);
    if app_valid.is_none() {
        return Json(json!({"success": false, "message": "应用不存在或已禁用"}));
    }

    let device_id_hash = EncryptedFieldsOps::generate_hash(&body.device_id);

    let device_card_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(DISTINCT a.card_id) FROM activations a JOIN cards c ON c.id = a.card_id WHERE a.device_id_hash = $1 AND c.merchant_id = $2"
    )
    .bind(&device_id_hash)
    .bind(merchant_id)
    .fetch_one(&state.pool)
    .await
    .unwrap_or((0,));

    if device_card_count.0 >= 3 {
        let hint = if body.device_id.len() >= 4 {
            format!("{}****", &body.device_id[..4])
        } else {
            "****".to_string()
        };
        let pool_alert = state.pool.clone();
        let mid = merchant_id;
        let h = hint.clone();
        let ipc = ip.clone();
        tokio::spawn(async move {
            let _ = sqlx::query(
                "INSERT INTO activation_alerts (merchant_id, alert_type, device_hint, ip_address, detail) VALUES ($1, 'device_multi_card', $2, $3, $4)"
            )
            .bind(mid)
            .bind(&h)
            .bind(&ipc)
            .bind(format!("设备 {} 已激活 {} 张卡密", h, device_card_count.0 + 1))
            .execute(&pool_alert)
            .await;
        });
    }

    {
        let mut redis = state.redis.clone();
        let rl_key = format!("rl:activate:{}", ip);
        let count: i64 = redis::AsyncCommands::get(&mut redis, &rl_key).await.unwrap_or(0i64);
        if count >= 15 {
            let pool_alert = state.pool.clone();
            let mid = merchant_id;
            let ipc = ip.clone();
            tokio::spawn(async move {
                let _ = sqlx::query(
                    "INSERT INTO activation_alerts (merchant_id, alert_type, ip_address, detail) VALUES ($1, 'ip_abuse', $2, $3) ON CONFLICT DO NOTHING"
                )
                .bind(mid)
                .bind(&ipc)
                .bind(format!("IP {} 本分钟已激活 {} 次", ipc, count))
                .execute(&pool_alert)
                .await;
            });
        }
    }

    let code_hash = EncryptedFieldsOps::generate_hash(&body.card_code);
    let card: Option<Card> = sqlx::query_as(
        "SELECT * FROM cards WHERE code_hash = $1 AND merchant_id = $2 AND app_id = $3",
    )
    .bind(&code_hash)
    .bind(merchant_id)
    .bind(body.app_id)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    let card = match card {
        Some(c) => c,
        None => return Json(json!({"success": false, "message": "卡密不存在"})),
    };

    match card.status.as_str() {
        "disabled" => return Json(json!({"success": false, "message": "卡密已被禁用"})),
        "expired" => return Json(json!({"success": false, "message": "卡密已过期"})),
        _ => {}
    }

    if let Some(exp) = card.expires_at {
        if Utc::now() > exp {
            let _ = sqlx::query("UPDATE cards SET status = 'expired' WHERE id = $1")
                .bind(card.id)
                .execute(&state.pool)
                .await;
            return Json(json!({"success": false, "message": "卡密已过期"}));
        }
    }

    let existing: Option<Activation> = sqlx::query_as(
        "SELECT * FROM activations WHERE card_id = $1 AND device_id_hash = $2",
    )
    .bind(card.id)
    .bind(&device_id_hash)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    if let Some(ex) = existing {
        let _ = sqlx::query("UPDATE activations SET last_verified_at = NOW() WHERE id = $1")
            .bind(ex.id)
            .execute(&state.pool)
            .await;
        let expires_at = card.expires_at;
        let remaining_days = expires_at.map(|e| (e - Utc::now()).num_days().max(0));
        return Json(json!({
            "success": true,
            "message": "卡密已激活（设备已绑定）",
            "data": { "expires_at": expires_at, "remaining_days": remaining_days, "max_devices": card.max_devices }
        }));
    }

    let device_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM activations WHERE card_id = $1")
        .bind(card.id)
        .fetch_one(&state.pool)
        .await
        .unwrap_or((0,));

    if device_count.0 >= card.max_devices as i64 {
        return Json(json!({
            "success": false,
            "message": format!("该卡密最多支持 {} 台设备，已达上限", card.max_devices)
        }));
    }

    let now = Utc::now();
    let expires_at = if card.activated_at.is_none() {
        Some(now + Duration::days(card.duration_days as i64))
    } else {
        card.expires_at
    };

    let activation_id = Uuid::new_v4();
    let encrypted_device_id = match EncryptedFieldsOps::encrypt_device_id(
        &state.pool,
        &state.encryptor,
        activation_id,
        &body.device_id,
    ).await {
        Ok(e) => e,
        Err(e) => {
            tracing::error!("加密设备 ID 失败: {}", e);
            return Json(json!({"success": false, "message": "激活失败"}));
        }
    };

    let _ = sqlx::query(
        "INSERT INTO activations (id, card_id, app_id, device_id_encrypted, device_id_hash, device_name, ip_address) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(activation_id)
    .bind(card.id)
    .bind(card.app_id)
    .bind(&encrypted_device_id)
    .bind(&device_id_hash)
    .bind(&body.device_name)
    .bind(&ip)
    .execute(&state.pool)
    .await;

    let _ = sqlx::query(
        "UPDATE cards SET status = 'active', activated_at = COALESCE(activated_at, NOW()), expires_at = $1 WHERE id = $2",
    )
    .bind(expires_at)
    .bind(card.id)
    .execute(&state.pool)
    .await;

    let remaining_days = expires_at.map(|e| (e - Utc::now()).num_days().max(0));

    let pool_clone = state.pool.clone();
    let app_id_clone = card.app_id;
    let webhook_payload = serde_json::json!({
        "card_code": body.card_code,
        "device_id": body.device_id,
        "device_name": body.device_name,
        "expires_at": expires_at,
        "remaining_days": remaining_days,
    });
    tokio::spawn(async move {
        crate::routes::webhooks::fire_webhook(&pool_clone, app_id_clone, "activate", webhook_payload).await;
    });

    let pool_commission = state.pool.clone();
    let mid_commission = merchant_id;
    let card_id_commission = card.id;
    tokio::spawn(async move {
        crate::routes::agent::record_commission(
            &pool_commission,
            mid_commission,
            card_id_commission,
            activation_id,
        ).await;
    });

    Json(json!({
        "success": true,
        "message": "激活成功",
        "data": {
            "expires_at": expires_at,
            "remaining_days": remaining_days,
            "max_devices": card.max_devices,
            "current_devices": device_count.0 + 1
        }
    }))
}

async fn verify(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<VerifyRequest>,
) -> Json<Value> {
    let api_key_hash = EncryptedFieldsOps::generate_hash(&body.api_key);
    let code_hash = EncryptedFieldsOps::generate_hash(&body.card_code);
    let device_id_hash = EncryptedFieldsOps::generate_hash(&body.device_id);

    let client_ip = extract_client_ip(&headers, &addr);

    // 获取 merchant_id 提前，供风控使用
    let merchant: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM merchants WHERE api_key_hash = $1 AND status = 'active'")
            .bind(&api_key_hash)
            .fetch_optional(&state.pool)
            .await
            .unwrap_or(None);

    let merchant_id = match merchant {
        Some((id,)) => id,
        None => {
            return Json(json!({"success": false, "valid": false, "message": "无效的 API Key"}));
        }
    };

    if let Some(rate) = check_card_rate(&state, merchant_id, &body.card_code, &client_ip, &body.device_id).await {
        return rate;
    }

    let cache_key = format!(
        "verify:{}:{}:{}:{}",
        &api_key_hash[..16], body.app_id, &code_hash[..16], &device_id_hash[..16]
    );
    let mut redis = state.redis.clone();

    if let Ok(Some(cached)) = redis.get::<_, Option<String>>(&cache_key).await {
        if let Ok(val) = serde_json::from_str::<Value>(&cached) {
            let cached_card_id = val.pointer("/data/card_id")
                .and_then(|v| v.as_str())
                .and_then(|s| uuid::Uuid::parse_str(s).ok());

            if let Some(cid) = cached_card_id {
                let live: Option<(String, Option<chrono::DateTime<chrono::Utc>>)> =
                    sqlx::query_as("SELECT status, expires_at FROM cards WHERE id = $1")
                        .bind(cid)
                        .fetch_optional(&state.pool)
                        .await
                        .unwrap_or(None);
                match live {
                    None => {
                        let _: redis::RedisResult<()> = redis.del(&cache_key).await;
                        return Json(json!({"success": false, "valid": false, "message": "卡密不存在"}));
                    }
                    Some((status, expires_at)) => {
                        if status == "disabled" {
                            let _: redis::RedisResult<()> = redis.del(&cache_key).await;
                            return Json(json!({"success": false, "valid": false, "message": "卡密已被禁用"}));
                        }
                        if let Some(exp) = expires_at {
                            if chrono::Utc::now() > exp {
                                let _: redis::RedisResult<()> = redis.del(&cache_key).await;
                                return Json(json!({"success": false, "valid": false, "message": "卡密已过期"}));
                            }
                        }
                    }
                }
            }

            let mut redis_bg = state.redis.clone();
            let cache_key_bg = cache_key.clone();
            tokio::spawn(async move {
                let _: redis::RedisResult<()> = redis_bg.expire(cache_key_bg.as_str(), 60).await;
            });
            return Json(val);
        }
    }

    // merchant_id 已验证，继续
    let app_valid: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM apps WHERE id = $1 AND merchant_id = $2 AND status = 'active'",
    )
    .bind(body.app_id)
    .bind(merchant_id)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    if app_valid.is_none() {
        return Json(json!({"success": false, "message": "应用不存在或已禁用"}));
    }

    let card: Option<Card> = sqlx::query_as(
        "SELECT * FROM cards WHERE code_hash = $1 AND merchant_id = $2 AND app_id = $3",
    )
    .bind(&code_hash)
    .bind(merchant_id)
    .bind(body.app_id)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    let card = match card {
        Some(c) => c,
        None => return Json(json!({"success": false, "message": "卡密不存在"})),
    };

    if let Some(exp) = card.expires_at {
        if Utc::now() > exp {
            let _ = sqlx::query("UPDATE cards SET status = 'expired' WHERE id = $1")
                .bind(card.id)
                .execute(&state.pool)
                .await;
            return Json(json!({"success": false, "message": "卡密已过期", "valid": false}));
        }
    }

    match card.status.as_str() {
        "disabled" => return Json(json!({"success": false, "valid": false, "message": "卡密已被禁用"})),
        "expired" => return Json(json!({"success": false, "valid": false, "message": "卡密已过期"})),
        "unused" => return Json(json!({"success": false, "valid": false, "message": "卡密尚未激活"})),
        _ => {}
    }

    let activation: Option<Activation> = sqlx::query_as(
        "SELECT * FROM activations WHERE card_id = $1 AND device_id_hash = $2",
    )
    .bind(card.id)
    .bind(&device_id_hash)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    if activation.is_none() {
        return Json(json!({
            "success": false,
            "valid": false,
            "message": "此设备未绑定该卡密"
        }));
    }

    let activation = activation.unwrap();

    let pool_bg = state.pool.clone();
    let act_id = activation.id;
    tokio::spawn(async move {
        let _ = sqlx::query("UPDATE activations SET last_verified_at = NOW() WHERE id = $1")
            .bind(act_id)
            .execute(&pool_bg)
            .await;
    });

    let remaining_days = card.expires_at.map(|e| (e - Utc::now()).num_days().max(0));
    let device_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM activations WHERE card_id = $1")
        .bind(card.id)
        .fetch_one(&state.pool)
        .await
        .unwrap_or((0,));

    let result = json!({
        "success": true,
        "valid": true,
        "message": "卡密有效",
        "data": {
            "activation_id": activation.id,
            "card_id": card.id,
            "expires_at": card.expires_at,
            "remaining_days": remaining_days,
            "max_devices": card.max_devices,
            "current_devices": device_count.0
        }
    });

    let _: redis::RedisResult<()> = redis::AsyncCommands::set_ex(
        &mut redis, &cache_key, result.to_string(), 60_u64,
    ).await;

    let pool_clone = state.pool.clone();
    let app_id_clone = card.app_id;
    let webhook_payload = serde_json::json!({
        "card_code": body.card_code,
        "device_id": body.device_id,
        "expires_at": card.expires_at,
        "remaining_days": remaining_days,
    });
    tokio::spawn(async move {
        crate::routes::webhooks::fire_webhook(&pool_clone, app_id_clone, "verify", webhook_payload).await;
    });

    Json(result)
}

async fn unbind(
    State(state): State<AppState>,
    Json(body): Json<UnbindRequest>,
) -> Json<Value> {
    // 设备封禁检查
    let device_id_hash = EncryptedFieldsOps::generate_hash(&body.device_id);
    let dev_blocked: Option<(String, Option<chrono::DateTime<chrono::Utc>>)> = sqlx::query_as(
        "SELECT reason, blocked_until FROM device_blacklist WHERE device_id_hash=$1 AND (blocked_until IS NULL OR blocked_until > NOW()) LIMIT 1"
    )
    .bind(&device_id_hash)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    if let Some((reason, until)) = dev_blocked {
        let remaining = until.map(|b| (b - Utc::now()).num_seconds().max(0)).unwrap_or(0);
        return Json(json!({
            "success": false,
            "message": "设备已被封禁，无法解绑",
            "data": { "remaining_seconds": remaining, "reason": reason }
        }));
    }

    let api_key_hash = EncryptedFieldsOps::generate_hash(&body.api_key);
    let merchant: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM merchants WHERE api_key_hash = $1 AND status = 'active'")
            .bind(&api_key_hash)
            .fetch_optional(&state.pool)
            .await
            .unwrap_or(None);

    let merchant_id = match merchant {
        Some((id,)) => id,
        None => return Json(json!({"success": false, "message": "无效的 API Key"})),
    };

    let app_valid: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM apps WHERE id = $1 AND merchant_id = $2 AND status = 'active'",
    )
    .bind(body.app_id)
    .bind(merchant_id)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    if app_valid.is_none() {
        return Json(json!({"success": false, "message": "应用不存在或已禁用"}));
    }

    let code_hash = EncryptedFieldsOps::generate_hash(&body.card_code);
    let card: Option<Card> = sqlx::query_as(
        "SELECT * FROM cards WHERE code_hash = $1 AND merchant_id = $2 AND app_id = $3",
    )
    .bind(&code_hash)
    .bind(merchant_id)
    .bind(body.app_id)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    let card = match card {
        Some(c) => c,
        None => return Json(json!({"success": false, "message": "卡密不存在"})),
    };
    let card_id = card.id;

    let activation: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM activations WHERE card_id = $1 AND device_id_hash = $2",
    )
    .bind(card_id)
    .bind(&device_id_hash)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    let activation_id = match activation {
        Some((id,)) => id,
        None => return Json(json!({"success": false, "message": "设备未绑定该卡密"})),
    };

    let result = sqlx::query("DELETE FROM activations WHERE id = $1")
        .bind(activation_id)
        .execute(&state.pool)
        .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => {
            let remaining: (i64,) =
                sqlx::query_as("SELECT COUNT(*) FROM activations WHERE card_id = $1")
                    .bind(card_id)
                    .fetch_one(&state.pool)
                    .await
                    .unwrap_or((0,));
            if remaining.0 == 0 {
                let _ = sqlx::query(
                    "UPDATE cards SET status = 'unused', activated_at = NULL, expires_at = NULL WHERE id = $1",
                )
                .bind(card_id)
                .execute(&state.pool)
                .await;
            }
            Json(json!({"success": true, "message": "设备已解绑"}))
        }
        Ok(_) => Json(json!({"success": false, "message": "设备未绑定该卡密"})),
        Err(e) => Json(json!({"success": false, "message": format!("操作失败: {}", e)})),
    }
}