use axum::{
    extract::{Path, State, Query},
    middleware,
    Json, Router,
    http::StatusCode,
    routing::{get, post, put},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::middleware::auth::{AppState, auth_middleware};
use crate::utils::jwt::Claims;
use axum::extract::Extension;

pub fn api_keys_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:id", put(update).delete(remove))
        .route("/:id/toggle", post(toggle))
        .route("/:id/stats", get(key_stats))
        .route("/:id/device-logs", get(device_logs))
        .route_layer(middleware::from_fn_with_state(state.clone(), auth_middleware))
        .with_state(state)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiKeyForm {
    pub name: String,
    #[serde(default)]
    pub encrypt_code: Option<String>,
    #[serde(default)]
    pub sign_code: Option<String>,
    #[serde(default)]
    pub join_template: Option<String>,
    #[serde(default)]
    pub request_method: Option<String>,
    #[serde(default)]
    pub request_base_url: Option<String>,
    #[serde(default)]
    pub request_success_check: Option<String>,
    pub params_template: Option<String>,
    pub response_template: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub encrypt_enabled: Option<bool>,
    #[serde(default)]
    pub encrypt_algorithm: Option<String>,
    #[serde(default)]
    pub encrypt_mode: Option<String>,
    #[serde(default)]
    pub encrypt_padding: Option<String>,
    #[serde(default)]
    pub encrypt_key: Option<String>,
    #[serde(default)]
    pub encrypt_iv_source: Option<String>,
    #[serde(default)]
    pub encrypt_param_name: Option<String>,
    #[serde(default)]
    pub encrypt_encoding: Option<String>,
    #[serde(default)]
    pub encrypt_charset: Option<String>,
    #[serde(default)]
    pub decrypt_code: Option<String>,
}

#[derive(Serialize)]
pub struct ApiResponse {
    pub code: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub msg: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

fn ok(data: serde_json::Value) -> Json<ApiResponse> {
    Json(ApiResponse { code: 200, msg: None, data: Some(data) })
}

fn ok_empty() -> Json<ApiResponse> {
    Json(ApiResponse { code: 200, msg: None, data: None })
}

fn err(msg: &str) -> Json<ApiResponse> {
    Json(ApiResponse { code: 400, msg: Some(msg.to_string()), data: None })
}

async fn list(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<ApiResponse>, StatusCode> {
    // 管理员看全部，商户只看自己的
    let rows: Vec<(serde_json::Value,)> = if claims.role == "admin" {
        sqlx::query_as(
            "SELECT row_to_json(t) FROM (SELECT id, name, encrypt_code, sign_code, join_template, request_method, request_base_url, request_success_check, status, params_template, response_template, encrypt_enabled, encrypt_algorithm, encrypt_mode, encrypt_padding, encrypt_key, encrypt_iv_source, encrypt_param_name, encrypt_encoding, encrypt_charset,decrypt_code, created_at, updated_at FROM api_keys ORDER BY created_at DESC) t"
        ).fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    } else {
        let uid = Uuid::parse_str(&claims.sub).unwrap_or_default();
        sqlx::query_as(
            "SELECT row_to_json(t) FROM (SELECT id, name, encrypt_code, sign_code, join_template, request_method, request_base_url, request_success_check, status, params_template, response_template, encrypt_enabled, encrypt_algorithm, encrypt_mode, encrypt_padding, encrypt_key, encrypt_iv_source, encrypt_param_name, encrypt_encoding, encrypt_charset,decrypt_code, created_at, updated_at FROM api_keys WHERE merchant_id = $1 ORDER BY created_at DESC) t"
        ).bind(uid).fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    };
    let data: Vec<serde_json::Value> = rows.into_iter().map(|r| r.0).collect();
    Ok(ok(serde_json::json!(data)))
}

async fn create(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(form): Json<ApiKeyForm>,
) -> Result<Json<ApiResponse>, StatusCode> {
    let id = Uuid::new_v4();
    // 管理员角色 merchant_id 设为 NULL，商户角色绑定自己的 uid
    let merchant_id: Option<Uuid> = if claims.role == "merchant" {
        Uuid::parse_str(&claims.sub).ok()
    } else {
        None
    };
    sqlx::query("INSERT INTO api_keys (id,merchant_id,name,encrypt_code,sign_code,join_template,request_method,request_base_url,request_success_check,status,params_template,response_template,encrypt_enabled,encrypt_algorithm,encrypt_mode,encrypt_padding,encrypt_key,encrypt_iv_source,encrypt_param_name,encrypt_encoding,encrypt_charset,decrypt_code) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)")
        .bind(id).bind(merchant_id).bind(&form.name).bind(&form.encrypt_code).bind(&form.sign_code).bind(&form.join_template)
        .bind(&form.request_method).bind(&form.request_base_url).bind(&form.request_success_check)
        .bind(form.status.as_deref().unwrap_or("active"))
        .bind(&form.params_template).bind(&form.response_template)
        .bind(&form.encrypt_enabled).bind(&form.encrypt_algorithm).bind(&form.encrypt_mode).bind(&form.encrypt_padding)
        .bind(&form.encrypt_key).bind(&form.encrypt_iv_source).bind(&form.encrypt_param_name)
        .bind(&form.encrypt_encoding).bind(&form.encrypt_charset).bind(&form.decrypt_code)
        .execute(&state.pool).await
        .map(|_| ok(serde_json::json!({"id": id.to_string()})))
        .map_err(|e| { tracing::error!("创建失败: {:?}", e); StatusCode::INTERNAL_SERVER_ERROR })
}

async fn update(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(form): Json<ApiKeyForm>,
) -> Result<Json<ApiResponse>, StatusCode> {
    sqlx::query("UPDATE api_keys SET name=$1,encrypt_code=$2,sign_code=$3,join_template=$4,request_method=$5,request_base_url=$6,request_success_check=$7,status=$8,params_template=$9,response_template=$10,encrypt_enabled=$11,encrypt_algorithm=$12,encrypt_mode=$13,encrypt_padding=$14,encrypt_key=$15,encrypt_iv_source=$16,encrypt_param_name=$17,encrypt_encoding=$18,encrypt_charset=$19,decrypt_code=$20,updated_at=NOW() WHERE id=$21")
        .bind(&form.name).bind(&form.encrypt_code).bind(&form.sign_code).bind(&form.join_template)
        .bind(&form.request_method).bind(&form.request_base_url).bind(&form.request_success_check)
        .bind(form.status.as_deref().unwrap_or("active")).bind(&form.params_template).bind(&form.response_template)
        .bind(&form.encrypt_enabled).bind(&form.encrypt_algorithm).bind(&form.encrypt_mode).bind(&form.encrypt_padding)
        .bind(&form.encrypt_key).bind(&form.encrypt_iv_source).bind(&form.encrypt_param_name)
        .bind(&form.encrypt_encoding).bind(&form.encrypt_charset).bind(&form.decrypt_code).bind(id)
        .execute(&state.pool).await
        .map(|_| ok_empty())
        .map_err(|e| { tracing::error!("更新失败: {:?}", e); StatusCode::INTERNAL_SERVER_ERROR })
}

async fn remove(State(state): State<AppState>, Path(id): Path<Uuid>) -> Result<Json<ApiResponse>, StatusCode> {
    sqlx::query("DELETE FROM api_keys WHERE id=$1").bind(id).execute(&state.pool).await
        .map(|_| ok_empty()).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn toggle(State(state): State<AppState>, Path(id): Path<Uuid>) -> Result<Json<ApiResponse>, StatusCode> {
    sqlx::query("UPDATE api_keys SET status=CASE WHEN status='active' THEN 'disabled' ELSE 'active' END, updated_at=NOW() WHERE id=$1")
        .bind(id).execute(&state.pool).await
        .map(|_| ok_empty()).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[derive(Deserialize)]
struct StatsQuery {
    card_hash: Option<String>,
}

async fn key_stats(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Query(q): Query<StatsQuery>,
) -> Result<Json<ApiResponse>, StatusCode> {
    let key_name: (String,) = sqlx::query_as("SELECT name FROM api_keys WHERE id=$1")
        .bind(id).fetch_one(&state.pool).await.map_err(|_| StatusCode::NOT_FOUND)?;
    let card_hash = q.card_hash.unwrap_or_default();
    let total: (i64,) = sqlx::query_as("SELECT COALESCE(SUM(count),0) FROM card_usage_total WHERE card_hash=$1 OR $1=''")
        .bind(&card_hash).fetch_one(&state.pool).await.unwrap_or((0,));
    let today = chrono::Utc::now().date_naive().to_string();
    let today_count: (i64,) = sqlx::query_as("SELECT COALESCE(SUM(count),0) FROM card_usage_daily WHERE date=$1 AND (card_hash=$2 OR $2='')")
        .bind(&today).bind(&card_hash).fetch_one(&state.pool).await.unwrap_or((0,));
    let devices: (i64,) = sqlx::query_as("SELECT COUNT(DISTINCT device_id) FROM api_call_logs WHERE key_name=$1")
        .bind(&key_name.0).fetch_one(&state.pool).await.unwrap_or((0,));
    Ok(ok(serde_json::json!({"key_name":key_name.0,"today":today_count.0,"total":total.0,"devices":devices.0})))
}

#[derive(Deserialize)]
struct LogQuery {
    device_id: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
}

async fn device_logs(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Query(q): Query<LogQuery>,
) -> Result<Json<ApiResponse>, StatusCode> {
    let key_name: (String,) = sqlx::query_as("SELECT name FROM api_keys WHERE id=$1")
        .bind(id).fetch_one(&state.pool).await.map_err(|_| StatusCode::NOT_FOUND)?;
    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(10).min(50);
    let offset = (page - 1) * page_size;

    let rows: Vec<(serde_json::Value,)> = if let Some(ref did) = q.device_id {
        sqlx::query_as("SELECT row_to_json(t) FROM (SELECT ip, device_id, COUNT(*) as count, MAX(created_at) as last_call FROM api_call_logs WHERE key_name=$1 AND device_id=$2 GROUP BY ip, device_id, DATE(created_at) ORDER BY last_call DESC LIMIT $3 OFFSET $4) t")
            .bind(&key_name.0).bind(did).bind(page_size).bind(offset)
            .fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    } else {
        sqlx::query_as("SELECT row_to_json(t) FROM (SELECT ip, device_id, COUNT(*) as count, MAX(created_at) as last_call FROM api_call_logs WHERE key_name=$1 GROUP BY ip, device_id ORDER BY last_call DESC LIMIT $2 OFFSET $3) t")
            .bind(&key_name.0).bind(page_size).bind(offset)
            .fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    };
    let data: Vec<serde_json::Value> = rows.into_iter().map(|r| r.0).collect();
    Ok(ok(serde_json::json!(data)))
}