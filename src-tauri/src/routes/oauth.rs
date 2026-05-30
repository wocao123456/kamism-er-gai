use crate::middleware::auth::AppState;
use axum::{
    extract::{Json, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
    Router,
};
use redis::AsyncCommands;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;
use rand::Rng;
use md5;

#[derive(Deserialize)]
pub struct OAuthLoginRequest {
    pub provider: String,
    pub open_id: String,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Deserialize)]
pub struct CompleteProfileRequest {
    pub token: String,
    pub username: String,
    pub password: String,
}

pub fn oauth_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/auth/oauth/login", post(oauth_login))
        .route("/auth/oauth/complete-profile", post(complete_profile))
        .with_state(state)
}

async fn oauth_login(
    State(state): State<AppState>,
    Json(body): Json<OAuthLoginRequest>,
) -> Response {
    let provider_key = format!("{}:{}", body.provider, body.open_id);

    let existing: Option<(String, String, String, String, String, Option<String>, String)> = sqlx::query_as(
        "SELECT id::text, username, email_encrypted, password_hash, role, avatar_url, plan FROM merchants WHERE provider_key = $1"
    )
    .bind(&provider_key)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    match existing {
        Some((id, username, _email_enc, _pwd_hash, role, avatar_url, plan)) => {
            let uid_uuid = Uuid::parse_str(&id).unwrap_or_default();
            let email_for_jwt = format!("{}@oauth.local", body.open_id);
            let token = crate::utils::jwt::generate_token(&uid_uuid, &role, &email_for_jwt, &state.jwt_secret).unwrap_or_default();
            let refresh_token = Uuid::new_v4().to_string();
            Json(json!({
                "success": true,
                "token": token,
                "refresh_token": refresh_token,
                "role": role,
                "user": {
                    "id": id,
                    "username": username,
                    "avatar": avatar_url,
                    "plan": plan,
                    "user_type": role,
                },
            }))
            .into_response()
        }
        None => {
            let temp_token = Uuid::new_v4().to_string();
            let mut c = state.redis.clone();
            let cache_key = format!("oauth:pending:{}", temp_token);
            let _: () = c
                .set_ex(
                    cache_key.clone(),
                    serde_json::to_string(&json!({
                        "provider": body.provider,
                        "open_id": body.open_id,
                        "username": body.username.unwrap_or_default(),
                        "avatar_url": body.avatar_url.unwrap_or_default(),
                    })).unwrap_or_default(),
                    600,
                )
                .await
                .unwrap_or(());

            Json(json!({
                "success": true,
                "need_profile_setup": true,
                "token": temp_token,
            }))
            .into_response()
        }
    }
}

async fn complete_profile(
    State(state): State<AppState>,
    Json(body): Json<CompleteProfileRequest>,
) -> Response {
    let cache_key = format!("oauth:pending:{}", body.token);
    let mut c = state.redis.clone();

    let cached: Option<String> = c.get(&cache_key).await.unwrap_or(None);
    match cached {
        Some(data_str) => {
            let data: serde_json::Value = match serde_json::from_str(&data_str) {
                Ok(v) => v,
                Err(_) => {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({"success": false, "message": "会话数据无效"})),
                    ).into_response();
                }
            };
            let provider = data["provider"].as_str().unwrap_or("unknown");
            let open_id = data["open_id"].as_str().unwrap_or("");
            let oauth_username = data["username"].as_str().unwrap_or("").to_string();

            let _: () = c.del(&cache_key).await.unwrap_or(());

            let mid = Uuid::new_v4();
            let raw_api_key = format!("km_{}", (0..30)
                .map(|_| {
                    let c2 = rand::thread_rng().gen_range(0..36);
                    if c2 < 10 {
                        ('0' as u8 + c2) as char
                    } else {
                        ('a' as u8 + c2 - 10) as char
                    }
                })
                .collect::<String>());
            let api_key_hash = format!("{:x}", md5::compute(raw_api_key.as_bytes()));
            let password_hash = bcrypt::hash(&body.password, bcrypt::DEFAULT_COST).unwrap_or_default();
            let email = format!("{}@oauth.local", open_id);
            let email_hash = format!("{:x}", md5::compute(email.as_bytes()));
            let display_username = if body.username.is_empty() {
                format!("{}_{}", provider, &mid.to_string()[..8])
            } else {
                body.username.clone()
            };

            let provider_key = format!("{}:{}", provider, open_id);

            let result = sqlx::query(
                "INSERT INTO merchants (id, username, email_encrypted, email_hash, api_key_encrypted, api_key_hash, password_hash, status, plan, email_verified, provider_key, avatar_url) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'free', true, $8, $9)"
            )
            .bind(mid)
            .bind(&display_username)
            .bind(&email)
            .bind(&email_hash)
            .bind(&raw_api_key)
            .bind(&api_key_hash)
            .bind(&password_hash)
            .bind(&provider_key)
            .bind(data["avatar_url"].as_str().unwrap_or(""))
            .execute(&state.pool)
            .await;

            match result {
                Ok(_) => {
                    let token = crate::utils::jwt::generate_token(&mid, "merchant", &email, &state.jwt_secret).unwrap_or_default();
                    let refresh_token = Uuid::new_v4().to_string();
                    Json(json!({
                        "success": true,
                        "token": token,
                        "refresh_token": refresh_token,
                        "role": "merchant",
                        "user": {
                            "id": mid.to_string(),
                            "username": display_username,
                            "avatar": data["avatar_url"].as_str().unwrap_or(""),
                            "plan": "free",
                            "user_type": "merchant",
                        },
                    }))
                    .into_response()
                }
                Err(_) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"success": false, "message": "创建用户失败"})),
                )
                    .into_response(),
            }
        }
        None => (
            StatusCode::BAD_REQUEST,
            Json(json!({"success": false, "message": "会话已过期，请重新登录"})),
        )
            .into_response(),
    }
}
