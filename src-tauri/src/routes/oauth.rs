use crate::db::encrypted_fields::EncryptedFieldsOps;
use crate::middleware::auth::{auth_middleware, AppState};
use crate::utils::jwt::Claims;
use axum::{
    extract::{Json, Query, State},
    http::StatusCode,
    middleware,
    response::{IntoResponse, Redirect, Response},
    routing::{get, post, put},
    Extension, Router,
};
use rand::Rng;
use redis::AsyncCommands;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

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

#[derive(Deserialize)]
pub struct OAuthProxyRequest {
    #[serde(default)]
    pub appid: String,
    #[serde(default)]
    pub appkey: String,
    #[serde(default)]
    pub redirect_uri: String,
    #[serde(rename = "type")]
    pub oauth_type: String,
}

#[derive(Deserialize)]
pub struct OAuthCallbackQuery {
    #[serde(rename = "type")]
    pub oauth_type: Option<String>,
    pub code: Option<String>,
}

#[derive(Deserialize)]
pub struct OAuthResultQuery {
    pub ticket: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthSettings {
    pub enabled: bool,
    pub appid: String,
    pub appkey: String,
    pub base_url: String,
    pub login_path: String,
    pub user_path: String,
    pub redirect_uri: String,
    pub enabled_types: Vec<String>,
}

#[derive(Deserialize)]
pub struct SaveOAuthSettings {
    pub enabled: bool,
    pub appid: String,
    pub appkey: String,
    pub base_url: String,
    pub login_path: String,
    pub user_path: String,
    pub redirect_uri: String,
    pub enabled_types: Vec<String>,
}

pub fn oauth_router(state: AppState) -> Router<AppState> {
    let admin_routes = Router::new()
        .route("/oauth/admin/config", get(get_admin_config).put(save_admin_config))
        .route_layer(middleware::from_fn_with_state(state.clone(), auth_middleware));

    let public_routes = Router::new()
        .route("/oauth/config", get(get_public_config))
        .route("/oauth/proxy", post(proxy_oauth_login))
        .route("/oauth/callback", get(oauth_callback))
        .route("/oauth/result", get(oauth_result))
        .route("/oauth/login", post(oauth_login))
        .route("/oauth/complete-profile", post(complete_profile));

    Router::new()
        .merge(admin_routes)
        .merge(public_routes)
        .with_state(state)
}

fn normalize_base_url(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

fn normalize_path(path: &str, default_path: &str) -> String {
    let p = path.trim();
    if p.is_empty() {
        default_path.to_string()
    } else if p.starts_with('/') {
        p.to_string()
    } else {
        format!("/{}", p)
    }
}

fn join_url(base: &str, path: &str) -> String {
    format!("{}{}", normalize_base_url(base), normalize_path(path, ""))
}

fn configured_redirect_uri(settings: &OAuthSettings) -> String {
    if settings.redirect_uri.trim().is_empty() {
        "/auth/oauth/callback".to_string()
    } else {
        settings.redirect_uri.clone()
    }
}

async fn load_settings(state: &AppState) -> OAuthSettings {
    let row: Option<(bool, String, String, String, String, String, String, Vec<String>)> = sqlx::query_as(
        "SELECT enabled, appid, appkey, base_url, login_path, user_path, redirect_uri, enabled_types FROM oauth_settings WHERE id = TRUE",
    )
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    match row {
        Some((enabled, appid, appkey, base_url, login_path, user_path, redirect_uri, enabled_types)) => OAuthSettings {
            enabled,
            appid,
            appkey,
            base_url,
            login_path,
            user_path,
            redirect_uri,
            enabled_types,
        },
        None => OAuthSettings {
            enabled: false,
            appid: String::new(),
            appkey: String::new(),
            base_url: "https://u.suyanw.cn".to_string(),
            login_path: "/connect.php".to_string(),
            user_path: "/api.php".to_string(),
            redirect_uri: String::new(),
            enabled_types: vec![],
        },
    }
}

fn public_settings_json(settings: OAuthSettings) -> Value {
    json!({
        "enabled": settings.enabled,
        "base_url": settings.base_url,
        "login_path": settings.login_path,
        "user_path": settings.user_path,
        "redirect_uri": configured_redirect_uri(&settings),
        "enabled_types": settings.enabled_types,
    })
}

async fn get_public_config(State(state): State<AppState>) -> Json<Value> {
    let settings = load_settings(&state).await;
    Json(json!({"success": true, "data": public_settings_json(settings)}))
}

async fn get_admin_config(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Response {
    if claims.role != "admin" {
        return (StatusCode::FORBIDDEN, Json(json!({"success": false, "message": "需要管理员权限"}))).into_response();
    }
    let settings = load_settings(&state).await;
    Json(json!({"success": true, "data": settings})).into_response()
}

async fn save_admin_config(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<SaveOAuthSettings>,
) -> Response {
    if claims.role != "admin" {
        return (StatusCode::FORBIDDEN, Json(json!({"success": false, "message": "需要管理员权限"}))).into_response();
    }

    let base_url = normalize_base_url(&body.base_url);
    let login_path = normalize_path(&body.login_path, "/connect.php");
    let user_path = normalize_path(&body.user_path, "/api.php");
    if body.enabled && (body.appid.trim().is_empty() || body.appkey.trim().is_empty() || base_url.is_empty()) {
        return (StatusCode::BAD_REQUEST, Json(json!({"success": false, "message": "OAuth配置不完整"}))).into_response();
    }

    let result = sqlx::query(
        "INSERT INTO oauth_settings (id, enabled, appid, appkey, base_url, login_path, user_path, redirect_uri, enabled_types, updated_at)
         VALUES (TRUE, $1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled, appid = EXCLUDED.appid, appkey = EXCLUDED.appkey, base_url = EXCLUDED.base_url, login_path = EXCLUDED.login_path, user_path = EXCLUDED.user_path, redirect_uri = EXCLUDED.redirect_uri, enabled_types = EXCLUDED.enabled_types, updated_at = NOW()",
    )
    .bind(body.enabled)
    .bind(body.appid.trim())
    .bind(body.appkey.trim())
    .bind(&base_url)
    .bind(&login_path)
    .bind(&user_path)
    .bind(body.redirect_uri.trim())
    .bind(&body.enabled_types)
    .execute(&state.pool)
    .await;

    match result {
        Ok(_) => Json(json!({"success": true, "message": "配置已保存"})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"success": false, "message": format!("保存失败: {}", e)}))).into_response(),
    }
}

async fn proxy_oauth_login(
    State(state): State<AppState>,
    Json(body): Json<OAuthProxyRequest>,
) -> Response {
    let settings = load_settings(&state).await;
    if !settings.enabled {
        return (StatusCode::BAD_REQUEST, Json(json!({"success": false, "message": "第三方登录未启用"}))).into_response();
    }
    if !settings.enabled_types.contains(&body.oauth_type) {
        return (StatusCode::BAD_REQUEST, Json(json!({"success": false, "message": "该登录类型未启用"}))).into_response();
    }

    let appid = if body.appid.trim().is_empty() { settings.appid.clone() } else { body.appid };
    let appkey = if body.appkey.trim().is_empty() { settings.appkey.clone() } else { body.appkey };
    let redirect_uri = if body.redirect_uri.trim().is_empty() { configured_redirect_uri(&settings) } else { body.redirect_uri };
    if appid.trim().is_empty() || appkey.trim().is_empty() || redirect_uri.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({"success": false, "message": "OAuth配置不完整"}))).into_response();
    }

    let params = [
        ("act", "login"),
        ("appid", appid.as_str()),
        ("appkey", appkey.as_str()),
        ("redirect_uri", redirect_uri.as_str()),
        ("type", body.oauth_type.as_str()),
    ];
    let login_url = join_url(&settings.base_url, &settings.login_path);
    match Client::new().get(&login_url).query(&params).send().await {
        Ok(resp) => {
            let text = resp.text().await.unwrap_or_default();
            if let Ok(v) = serde_json::from_str::<Value>(&text) {
                if let Some(url) = v.get("url").and_then(|u| u.as_str()) {
                    return Json(json!({"success": true, "data": {"url": url}, "url": url})).into_response();
                }
                if let Some(url) = v.pointer("/data/url").and_then(|u| u.as_str()) {
                    return Json(json!({"success": true, "data": {"url": url}, "url": url})).into_response();
                }
                return Json(json!({"success": false, "message": v.get("msg").or_else(|| v.get("message")).and_then(|m| m.as_str()).unwrap_or("获取登录地址失败"), "raw": v})).into_response();
            }
            Json(json!({"success": false, "message": "获取登录地址失败", "raw": text})).into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, Json(json!({"success": false, "message": format!("请求OAuth服务失败: {}", e)}))).into_response(),
    }
}

fn find_str(v: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        for ptr in [format!("/{}", key), format!("/data/{}", key), format!("/userinfo/{}", key), format!("/data/userinfo/{}", key)] {
            if let Some(x) = v.pointer(&ptr) {
                if let Some(s) = x.as_str().filter(|s| !s.is_empty()) {
                    return Some(s.to_string());
                }
                if let Some(n) = x.as_i64() {
                    return Some(n.to_string());
                }
                if let Some(n) = x.as_u64() {
                    return Some(n.to_string());
                }
            }
        }
    }
    None
}

async fn fetch_oauth_user(state: &AppState, oauth_type: &str, code: &str) -> Result<(String, String, String, Option<String>), String> {
    let settings = load_settings(state).await;
    if !settings.enabled {
        return Err("第三方登录未启用".to_string());
    }
    let candidates = vec![
        join_url(&settings.base_url, &settings.user_path),
        join_url(&settings.base_url, &settings.login_path),
        join_url(&settings.base_url, "/connect.php"),
    ];
    let mut last_text = String::new();
    let mut parsed: Option<Value> = None;
    for user_url in candidates {
        for act in ["callback", "get_user_info", "userinfo"] {
            let params = [
                ("act", act),
                ("appid", settings.appid.as_str()),
                ("appkey", settings.appkey.as_str()),
                ("type", oauth_type),
                ("code", code),
            ];
            match Client::new().get(&user_url).query(&params).send().await {
                Ok(resp) => {
                    let status = resp.status();
                    let text = resp.text().await.unwrap_or_default();
                    last_text = text.clone();
                    if status.is_success() {
                        if let Ok(v) = serde_json::from_str::<Value>(&text) {
                            parsed = Some(v);
                            break;
                        }
                    }
                }
                Err(e) => last_text = format!("请求用户信息失败: {}", e),
            }
        }
        if parsed.is_some() { break; }
    }
    let v = parsed.ok_or_else(|| format!("OAuth返回格式无效: {}", last_text))?;
    let open_id = find_str(&v, &["openid", "open_id", "social_uid", "uid", "id", "unionid"])
        .ok_or_else(|| format!("OAuth返回缺少openid: {}", v))?;
    let username = find_str(&v, &["nickname", "nick", "name", "username"]).unwrap_or_else(|| oauth_type.to_string());
    let avatar = find_str(&v, &["avatar", "avatar_url", "faceimg", "figureurl_qq_2", "headimgurl"]).unwrap_or_default();
    let email = find_str(&v, &["email", "mail", "qq_email"]);
    Ok((open_id, username, avatar, email))
}


fn oauth_email_or_fallback(provider: &str, open_id: &str, oauth_email: Option<&str>) -> String {
    if let Some(email) = oauth_email.filter(|e| e.contains('@')) { return email.to_lowercase(); }
    if provider == "qq" && open_id.chars().all(|c| c.is_ascii_digit()) { return format!("{}@qq.com", open_id); }
    format!("{}@oauth.local", open_id)
}

async fn issue_or_create_oauth_login(
    state: &AppState,
    provider: &str,
    open_id: &str,
    username: &str,
    avatar_url: &str,
    oauth_email: Option<&str>,
) -> Result<Value, String> {
    let provider_key = format!("{}:{}", provider, open_id);
    let existing: Option<(String, String, Option<String>, String)> = sqlx::query_as(
        "SELECT id::text, username, avatar_url, plan FROM merchants WHERE provider_key = $1",
    )
    .bind(&provider_key)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some((id, username, stored_avatar, plan)) = existing {
        let uid_uuid = Uuid::parse_str(&id).map_err(|_| "用户ID无效".to_string())?;
        let final_avatar = if avatar_url.trim().is_empty() { stored_avatar.unwrap_or_default() } else { avatar_url.to_string() };
        let email_for_jwt = oauth_email_or_fallback(provider, open_id, oauth_email);
        if !avatar_url.trim().is_empty() || !email_for_jwt.ends_with("@oauth.local") {
            if let Ok(uid) = Uuid::parse_str(&id) {
                if let Ok(encrypted_email) = EncryptedFieldsOps::encrypt_merchant_email(&state.pool, &state.encryptor, uid, &email_for_jwt).await {
                    let email_hash = EncryptedFieldsOps::generate_hash(&email_for_jwt);
                    let _ = sqlx::query("UPDATE merchants SET avatar_url = COALESCE(NULLIF($1, ''), avatar_url), email_encrypted = $2, email_hash = $3 WHERE id = $4")
                        .bind(avatar_url)
                        .bind(encrypted_email)
                        .bind(email_hash)
                        .bind(uid)
                        .execute(&state.pool)
                        .await;
                }
            }
        }
        let role = "merchant".to_string();
        let token = crate::utils::jwt::generate_token(&uid_uuid, &role, &email_for_jwt, &state.jwt_secret).map_err(|e| e.to_string())?;
        let refresh_token = Uuid::new_v4().to_string();
        return Ok(json!({
            "success": true,
            "created": false,
            "token": token,
            "refresh_token": refresh_token,
            "role": role,
            "user": {
                "id": id,
                "username": username,
                "email": email_for_jwt,
                "avatar": final_avatar,
                "plan": plan,
                "user_type": role
            }
        }));
    }

    let mid = Uuid::new_v4();
    let raw_api_key = format!("km_{}", (0..30)
        .map(|_| {
            let c2 = rand::thread_rng().gen_range(0..36);
            if c2 < 10 { ('0' as u8 + c2) as char } else { ('a' as u8 + c2 - 10) as char }
        })
        .collect::<String>());
    let api_key_hash = EncryptedFieldsOps::generate_hash(&raw_api_key);
    let password_hash = bcrypt::hash(Uuid::new_v4().to_string(), bcrypt::DEFAULT_COST).map_err(|e| e.to_string())?;
    let email = oauth_email_or_fallback(provider, open_id, oauth_email);
    let email_hash = EncryptedFieldsOps::generate_hash(&email);
    let encrypted_api_key = EncryptedFieldsOps::encrypt_merchant_api_key(&state.pool, &state.encryptor, mid, &raw_api_key).await.map_err(|_| "API Key加密失败".to_string())?;
    let encrypted_email = EncryptedFieldsOps::encrypt_merchant_email(&state.pool, &state.encryptor, mid, &email).await.map_err(|_| "邮箱加密失败".to_string())?;
    let display_username = if username.trim().is_empty() { format!("{}_{}", provider, &mid.to_string()[..8]) } else { username.trim().to_string() };

    sqlx::query(
        "INSERT INTO merchants (id, username, email_encrypted, email_hash, api_key_encrypted, api_key_hash, password_hash, status, plan, email_verified, provider_key, avatar_url) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'free', true, $8, $9)",
    )
    .bind(mid)
    .bind(&display_username)
    .bind(&encrypted_email)
    .bind(&email_hash)
    .bind(&encrypted_api_key)
    .bind(&api_key_hash)
    .bind(&password_hash)
    .bind(&provider_key)
    .bind(avatar_url)
    .execute(&state.pool)
    .await
    .map_err(|e| format!("创建用户失败: {}", e))?;

    let token = crate::utils::jwt::generate_token(&mid, "merchant", &email, &state.jwt_secret).map_err(|e| e.to_string())?;
    let refresh_token = Uuid::new_v4().to_string();
    Ok(json!({
        "success": true,
        "created": true,
        "token": token,
        "refresh_token": refresh_token,
        "role": "merchant",
        "user": {
            "id": mid.to_string(),
            "username": display_username,
            "avatar": avatar_url,
            "plan": "free",
            "user_type": "merchant",
            "api_key": raw_api_key
        }
    }))
}

async fn oauth_callback(
    State(state): State<AppState>,
    Query(query): Query<OAuthCallbackQuery>,
) -> Response {
    let oauth_type = query.oauth_type.unwrap_or_else(|| "qq".to_string());
    let code = match query.code {
        Some(c) if !c.trim().is_empty() => c,
        _ => return Redirect::to("/oauth/callback?error=missing_code").into_response(),
    };

    let result = match fetch_oauth_user(&state, &oauth_type, &code).await {
        Ok((open_id, username, avatar, email)) => issue_or_create_oauth_login(&state, &oauth_type, &open_id, &username, &avatar, email.as_deref()).await,
        Err(e) => Err(e),
    };

    match result {
        Ok(payload) => {
            let ticket = Uuid::new_v4().to_string();
            let mut c = state.redis.clone();
            let _: () = c.set_ex(format!("oauth:result:{}", ticket), payload.to_string(), 86400).await.unwrap_or(());
            Redirect::to(&format!("/oauth/callback?ticket={}", ticket)).into_response()
        }
        Err(e) => {
            let ticket = Uuid::new_v4().to_string();
            let mut c = state.redis.clone();
            let payload = json!({"success": false, "message": e});
            let _: () = c.set_ex(format!("oauth:result:{}", ticket), payload.to_string(), 86400).await.unwrap_or(());
            Redirect::to(&format!("/oauth/callback?ticket={}", ticket)).into_response()
        }
    }
}

async fn oauth_result(
    State(state): State<AppState>,
    Query(query): Query<OAuthResultQuery>,
) -> Response {
    let mut c = state.redis.clone();
    let key = format!("oauth:result:{}", query.ticket);
    let cached: Option<String> = c.get(&key).await.unwrap_or(None);
    match cached {
        Some(s) => match serde_json::from_str::<Value>(&s) {
            Ok(v) => Json(v).into_response(),
            Err(_) => (StatusCode::BAD_REQUEST, Json(json!({"success": false, "message": "OAuth结果无效"}))).into_response(),
        },
        None => (StatusCode::BAD_REQUEST, Json(json!({"success": false, "message": "OAuth登录会话已过期"}))).into_response(),
    }
}

async fn oauth_login(
    State(state): State<AppState>,
    Json(body): Json<OAuthLoginRequest>,
) -> Response {
    match issue_or_create_oauth_login(
        &state,
        &body.provider,
        &body.open_id,
        body.username.as_deref().unwrap_or(""),
        body.avatar_url.as_deref().unwrap_or(""),
        None,
    )
    .await
    {
        Ok(v) => Json(v).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"success": false, "message": e}))).into_response(),
    }
}

async fn complete_profile(
    State(_state): State<AppState>,
    Json(_body): Json<CompleteProfileRequest>,
) -> Response {
    (StatusCode::BAD_REQUEST, Json(json!({"success": false, "message": "当前版本已支持OAuth自动注册，请重新发起第三方登录"}))).into_response()
}
