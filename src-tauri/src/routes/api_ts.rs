use axum::{
    extract::{State, Query, Path as AxumPath},
    Json, Router,
    http::{StatusCode, HeaderMap},
    routing::{post, get},
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::middleware::auth::AppState;
use redis::AsyncCommands;
use sha2::{Sha256, Digest};

pub fn api_ts_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/auth/gen-key", post(gen_auth_key))
        .route("/sign", post(generate_sign))
        .route("/encrypt", post(generate_encrypt))
        .route("/decrypt", post(generate_decrypt))
        .route("/latest", get(latest_auth_key))
        .route("/logs", get(call_logs))
        .route("/logs/:id", get(call_log_detail))
        .route("/stats", get(call_stats))
        .with_state(state)
}

#[derive(Deserialize)]
pub struct CryptoRequest {
    pub key_name: String,
    pub text: String,
    #[serde(default)]
    pub params: HashMap<String, String>,
    #[serde(default)]
    pub device: Option<DeviceInfo>,
    #[serde(default)]
    pub source: Option<String>,
}

#[derive(Deserialize)]
pub struct DeviceInfo {
    pub ip: Option<String>,
    pub device_id: Option<String>,
}

#[derive(Deserialize)]
pub struct GenKeyRequest {
    pub card_key: String,
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

fn err(code: i32, msg: &str) -> Json<ApiResponse> {
    Json(ApiResponse { code, msg: Some(msg.to_string()), data: None })
}

fn sha256(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn run_python(code: &str, params: &HashMap<String, String>) -> Result<String, String> {
    let mut py_code = String::from("import hashlib\nimport urllib.parse\n");
    py_code.push_str(code);
    py_code.push_str("\n");
    py_code.push_str(&format!("params = {:?}\n", params));
    py_code.push_str("result = generate_key(params)\nprint(result)");
    use std::process::Command;
    let output = Command::new("python3").arg("-c").arg(&py_code).output()
        .map_err(|_| "Python 执行环境异常".to_string())?;
    if !output.status.success() {
        return Err(format!("执行失败: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// 从 Authorization: Bearer <token> 请求头中提取 token
fn extract_bearer(headers: &HeaderMap) -> Option<String> {
    headers.get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .map(|s| s.to_string())
}

async fn gen_auth_key(State(state): State<AppState>, Json(body): Json<GenKeyRequest>) -> Json<ApiResponse> {
    let card_hash = sha256(&body.card_key);
    let card: Option<(String,)> = sqlx::query_as("SELECT c.status FROM cards c JOIN activations a ON a.card_id = c.id WHERE c.code_hash = $1 AND c.status = 'active' AND (c.expires_at IS NULL OR c.expires_at > NOW()) LIMIT 1")
        .bind(&card_hash).fetch_optional(&state.pool).await.unwrap_or(None);
    if card.is_none() { return err(403, "卡密无效、已过期或无激活记录"); }
    let today = chrono::Utc::now().date_naive().to_string();
    sqlx::query("INSERT INTO card_usage_total (card_hash, count) VALUES ($1,1) ON CONFLICT(card_hash) DO UPDATE SET count=card_usage_total.count+1").bind(&card_hash).execute(&state.pool).await.ok();
    sqlx::query("INSERT INTO card_usage_daily (card_hash, date, count) VALUES ($1,$2,1) ON CONFLICT(card_hash,date) DO UPDATE SET count=card_usage_daily.count+1").bind(&card_hash).bind(&today).execute(&state.pool).await.ok();
    let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis();
    let rand_str: String = (0..16).map(|_| { use rand::Rng; let c = rand::thread_rng().gen_range(0..62); if c < 10 { (b'0' + c) as char } else if c < 36 { (b'a' + c - 10) as char } else { (b'A' + c - 36) as char } }).collect();
    let raw = format!("{}_{}_{}", body.card_key, ts, rand_str);
    let auth_key = sha256(&raw);
    let mut redis = state.redis.clone();
    let _: () = redis.set_ex(format!("ts:{}", auth_key), &body.card_key, 600).await.unwrap_or(());
    ok(serde_json::json!({"auth_key": auth_key}))
}

async fn verify_auth_key(state: &AppState, auth_key: &str) -> Result<String, StatusCode> {
    let mut redis = state.redis.clone();
    let used: bool = redis.exists(format!("ts_used:{}", auth_key)).await.unwrap_or(false);
    if used { return Err(StatusCode::FORBIDDEN); }
    let card_key: Option<String> = redis.get(format!("ts:{}", auth_key)).await.unwrap_or(None);
    let card_key = card_key.ok_or(StatusCode::FORBIDDEN)?;
    let _: () = redis.set_ex(format!("ts_used:{}", auth_key), "1", 86400).await.unwrap_or(());
    Ok(card_key)
}

async fn get_key(state: &AppState, name: &str) -> Result<serde_json::Value, StatusCode> {
    let row: Option<(serde_json::Value,)> = sqlx::query_as("SELECT row_to_json(api_keys.*) FROM api_keys WHERE name=$1 AND status='active'")
        .bind(name).fetch_optional(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    row.map(|r| r.0).ok_or(StatusCode::NOT_FOUND)
}

async fn log_call(pool: &sqlx::PgPool, key_name: &str, auth_key: &str, card_key: &str, ip: &str, status: &str, result: &Option<String>, params: Option<serde_json::Value>, fail_reason: Option<&str>) {
    let r = sqlx::query("INSERT INTO api_call_logs (key_name, auth_key, card_key, ip, status, sign_result, params, fail_reason) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)")
        .bind(key_name).bind(auth_key).bind(card_key).bind(ip).bind(status).bind(result).bind(params).bind(fail_reason).execute(pool).await;
    if let Err(e) = &r { eprintln!("log_call 写入失败: {:?}", e); }
}

// ── 签名接口：auth_key 从 Header 获取 ──
async fn generate_sign(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params_map): Query<HashMap<String, String>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<ApiResponse>, StatusCode> {
    let auth_key = extract_bearer(&headers).unwrap_or_default();
    if auth_key.is_empty() {
        return Ok(Json(ApiResponse { code: 403, msg: Some("缺少 Authorization 头".into()), data: None }));
    }
    let card_key = match verify_auth_key(&state, &auth_key).await {
        Ok(ck) => ck,
        Err(_) => { return Ok(Json(ApiResponse { code: 403, msg: Some("鉴权失败".into()), data: None })); }
    };
    let key_name = params_map.get("key_name").cloned()
        .or_else(|| body.get("key_name").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .unwrap_or_default();
    if key_name.is_empty() { return Ok(err(403, "未指定 key_name")); }
    let source = body.get("source").and_then(|v| v.as_str()).unwrap_or("");
    let display_card = if source == "web_test" { "内部测试".to_string() } else { card_key.clone() };
    let key = get_key(&state, &key_name).await?;
    let sign_code = key.get("sign_code").and_then(|v| v.as_str()).unwrap_or("");
    if sign_code.is_empty() { return Ok(err(403, "未配置签名逻辑")); }
    let sign_params: HashMap<String, String> = if let Some(obj) = body.as_object() {
        let mut map = HashMap::new();
        for (k, v) in obj { map.insert(k.clone(), v.as_str().unwrap_or("").to_string()); }
        map
    } else { HashMap::new() };
    let ip = "";
    match run_python(sign_code, &sign_params) {
        Ok(sign) => {
            log_call(&state.pool, &key_name, &auth_key, &display_card, ip, "success", &Some(sign.clone()), Some(body.clone()), None).await;
            Ok(ok(serde_json::json!({"key": sign})))
        }
        Err(e) => {
            log_call(&state.pool, &key_name, &auth_key, &display_card, ip, "python_error", &None, Some(body.clone()), Some(&e)).await;
            Ok(err(400, &format!("签名执行失败: {}", e)))
        }
    }
}

// ── 加密接口：auth_key 从 Header 获取 ──
async fn generate_encrypt(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<CryptoRequest>,
) -> Result<Json<ApiResponse>, StatusCode> {
    let auth_key = extract_bearer(&headers).unwrap_or_default();
    if auth_key.is_empty() {
        return Ok(Json(ApiResponse { code: 403, msg: Some("缺少 Authorization 头".into()), data: None }));
    }
    let ip = req.device.as_ref().and_then(|d| d.ip.as_deref()).unwrap_or("").to_string();
    let card_key = match verify_auth_key(&state, &auth_key).await {
        Ok(ck) => ck,
        Err(_) => { return Ok(Json(ApiResponse { code: 403, msg: Some("鉴权失败".into()), data: None })); }
    };
    let source = req.source.as_deref().unwrap_or("");
    let display_card = if source == "web_test" { "内部测试".to_string() } else { card_key };
    let key = get_key(&state, &req.key_name).await?;
    let encrypt_code = key.get("encrypt_code").and_then(|v| v.as_str()).unwrap_or("");
    if encrypt_code.is_empty() { return Ok(err(403, "未配置加密逻辑")); }
    let mut params = req.params.clone();
    params.insert("text".to_string(), req.text.clone());
    match run_python(encrypt_code, &params) {
        Ok(result) => {
            log_call(&state.pool, &req.key_name, &auth_key, &display_card, &ip, "success", &Some(result.clone()), Some(serde_json::to_value(&params).unwrap_or_default()), None).await;
            Ok(ok(serde_json::json!({"result": result})))
        }
        Err(e) => {
            log_call(&state.pool, &req.key_name, &auth_key, &display_card, &ip, "python_error", &None, Some(serde_json::to_value(&params).unwrap_or_default()), Some(&e)).await;
            Ok(err(400, &format!("加密执行失败: {}", e)))
        }
    }
}

// ── 解密接口：auth_key 从 Header 获取 ──
async fn generate_decrypt(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<CryptoRequest>,
) -> Result<Json<ApiResponse>, StatusCode> {
    let auth_key = extract_bearer(&headers).unwrap_or_default();
    if auth_key.is_empty() {
        return Ok(Json(ApiResponse { code: 403, msg: Some("缺少 Authorization 头".into()), data: None }));
    }
    let ip = req.device.as_ref().and_then(|d| d.ip.as_deref()).unwrap_or("").to_string();
    let card_key = match verify_auth_key(&state, &auth_key).await {
        Ok(ck) => ck,
        Err(_) => { return Ok(Json(ApiResponse { code: 403, msg: Some("鉴权失败".into()), data: None })); }
    };
    let source = req.source.as_deref().unwrap_or("");
    let display_card = if source == "web_test" { "内部测试".to_string() } else { card_key };
    let key = get_key(&state, &req.key_name).await?;
    let decrypt_code = key.get("decrypt_code").and_then(|v| v.as_str()).unwrap_or("");
    if decrypt_code.is_empty() { return Ok(err(403, "未配置解密逻辑")); }
    let mut params = req.params.clone();
    params.insert("text".to_string(), req.text.clone());
    match run_python(decrypt_code, &params) {
        Ok(result) => {
            log_call(&state.pool, &req.key_name, &auth_key, &display_card, &ip, "success", &Some(result.clone()), Some(serde_json::to_value(&params).unwrap_or_default()), None).await;
            Ok(ok(serde_json::json!({"result": result})))
        }
        Err(e) => {
            log_call(&state.pool, &req.key_name, &auth_key, &display_card, &ip, "python_error", &None, Some(serde_json::to_value(&params).unwrap_or_default()), Some(&e)).await;
            Ok(err(400, &format!("解密执行失败: {}", e)))
        }
    }
}

async fn latest_auth_key(State(state): State<AppState>) -> Json<ApiResponse> {
    let mut redis = state.redis.clone();
    let keys: Vec<String> = redis.keys("ts:*").await.unwrap_or_default();
    let mut latest = String::new(); let mut max_ttl: i64 = 0;
    for key in &keys {
        if key.contains("ts_used:") { continue; }
        let ttl: i64 = redis.ttl(key).await.unwrap_or(0);
        if ttl > max_ttl { max_ttl = ttl; latest = key.strip_prefix("ts:").unwrap_or(key).to_string(); }
    }
    ok(serde_json::json!({"auth_key": latest}))
}

#[derive(Deserialize)]
pub struct CallLogQuery { pub page: Option<i64>, pub page_size: Option<i64>, pub key_name: Option<String>, pub status: Option<String>, pub date_from: Option<String>, pub date_to: Option<String> }

async fn call_logs(State(state): State<AppState>, Query(q): Query<CallLogQuery>) -> Json<ApiResponse> {
    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(20);
    let rows: Vec<(uuid::Uuid, String, Option<String>, String, String, String, Option<String>, Option<String>, Option<serde_json::Value>, chrono::DateTime<chrono::Utc>)> =
        sqlx::query_as("SELECT id, key_name, card_key, auth_key, ip, status, sign_result, fail_reason, params, created_at FROM api_call_logs ORDER BY created_at DESC")
            .fetch_all(&state.pool).await.unwrap_or_default();

    // 只合并今天的，昨天的保持原样
    let today_str = chrono::Utc::now().date_naive().to_string();
    let mut groups: HashMap<(String, String, i64), Vec<serde_json::Value>> = HashMap::new();
    let mut yesterday_items: Vec<serde_json::Value> = Vec::new();
    for (id, kn, ck, _ak, _ip, st, sr, fr, params, ca) in &rows {
        let card = ck.clone().unwrap_or_default();
        let date = ca.date_naive().to_string();
        let row_json = serde_json::json!({
            "id": id, "key_name": kn, "card_key": card,
            "created_at": ca, "status": st,
            "sign_result": sr, "fail_reason": fr,
            "params": params, "sub_items": []
        });
        if date == today_str {
            // 今天的：5秒合并
            let window = ca.timestamp() / 5;
            let key = (kn.clone(), card.clone(), window);
            groups.entry(key).or_default().push(serde_json::json!({
                "id": id, "status": st, "sign_result": sr, "fail_reason": fr, "params": params, "created_at": ca
            }));
        } else {
            // 昨天及之前：不合并，直接加入
            yesterday_items.push(row_json);
        }
    }
    let mut merged: Vec<serde_json::Value> = Vec::new();
    for ((kn, card, _), mut items) in groups {
        items.sort_by(|a,b| a["created_at"].as_str().cmp(&b["created_at"].as_str()));
        let first = items.remove(0);
        merged.push(serde_json::json!({
            "id": first["id"], "key_name": kn, "card_key": card,
            "created_at": first["created_at"], "status": first["status"],
            "sign_result": first["sign_result"], "fail_reason": first["fail_reason"],
            "sub_items": items
        }));
    }
    // 合并且排序：今天的合并项 + 昨天的原始项
    merged.extend(yesterday_items);
    merged.sort_by(|a,b| b["created_at"].as_str().cmp(&a["created_at"].as_str()));

    // 今日合并后的成功/失败（在移动 merged 之前算）
    let today_merged: Vec<_> = merged.iter().filter(|m| {
        m["created_at"].as_str().unwrap_or("").starts_with(&today_str)
    }).collect();
    let today_success = today_merged.iter().filter(|m| m["status"] == "success").count() as i64;
    let today_failed = today_merged.iter().filter(|m| m["status"] != "success").count() as i64;

    let raw_total = rows.len() as i64;
    let total = merged.len() as i64;

    // 按天统计原始请求数
    use std::collections::BTreeMap;
    let mut daily: BTreeMap<String, i64> = BTreeMap::new();
    for row in &rows {
        let date = row.9.date_naive().to_string();
        *daily.entry(date).or_default() += 1;
    }
    let yesterday_str = (chrono::Utc::now() - chrono::Duration::days(1)).date_naive().to_string();
    let today_count = daily.get(&today_str).copied().unwrap_or(0);
    let yesterday_count = daily.get(&yesterday_str).copied().unwrap_or(0);

    ok(serde_json::json!({ "data": merged, "total": total, "rawTotal": raw_total, "todayCount": today_count, "yesterdayCount": yesterday_count, "todaySuccess": today_success, "todayFailed": today_failed, "page": page, "page_size": page_size }))
}

async fn call_log_detail(State(state): State<AppState>, AxumPath(id): AxumPath<uuid::Uuid>) -> Json<ApiResponse> {
    let row: Option<(uuid::Uuid, String, Option<String>, String, String, String, Option<String>, Option<String>, Option<serde_json::Value>, chrono::DateTime<chrono::Utc>)> =
        sqlx::query_as("SELECT id, key_name, card_key, auth_key, ip, status, sign_result, fail_reason, params, created_at FROM api_call_logs WHERE id = $1")
            .bind(&id).fetch_optional(&state.pool).await.unwrap_or(None);
    match row {
        Some((id, kn, ck, ak, ip, st, sr, fr, params, ca)) => ok(serde_json::json!({"id": id, "key_name": kn, "card_key": ck, "auth_key": ak, "ip": ip, "status": st, "sign_result": sr, "fail_reason": fr, "params": params, "created_at": ca})),
        None => err(404, "记录不存在")
    }
}

async fn call_stats(State(state): State<AppState>) -> Json<ApiResponse> {
    let today = chrono::Utc::now().date_naive().to_string();
    let today_success: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM api_call_logs WHERE status='success' AND created_at::date=$1::date").bind(&today).fetch_one(&state.pool).await.unwrap_or((0,));
    let today_failed: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM api_call_logs WHERE status!='success' AND created_at::date=$1::date").bind(&today).fetch_one(&state.pool).await.unwrap_or((0,));
    ok(serde_json::json!({ "today_success": today_success.0, "today_failed": today_failed.0 }))
}
