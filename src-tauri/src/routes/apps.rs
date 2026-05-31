use crate::{
    middleware::auth::{AppState, auth_middleware},
    models::app::App,
    routes::plan_config::get_config_by_plan,
    utils::jwt::Claims,
};
use axum::{
    extract::{Path, Query, State},
    middleware,
    routing::{get, patch, post},
    Extension, Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;
use crate::db::encrypted_fields::EncryptedFieldsOps;
use bcrypt::{hash, DEFAULT_COST};

#[derive(Deserialize)]
pub struct CreateAppRequest {
    pub app_name: String,
    pub description: Option<String>,
}

#[derive(Deserialize)]
pub struct AppQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

#[derive(Deserialize)]
pub struct BatchStatusRequest {
    pub ids: Vec<Uuid>,
    pub status: String,
}

pub fn apps_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/apps", get(list_apps).post(create_app))
        .route("/apps/batch-status", post(batch_update_app_status))
        .route("/apps/:id", get(get_app).delete(delete_app))
        .route("/apps/:id/status", patch(update_app_status))
        .route_layer(middleware::from_fn_with_state(state, auth_middleware))
}

async fn ensure_admin_merchant(state: &AppState, claims: &Claims) -> Result<Uuid, String> {
    let id = Uuid::parse_str(&claims.sub).map_err(|_| "无效用户ID".to_string())?;
    let exists: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM merchants WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);
    if exists.is_some() {
        return Ok(id);
    }

    let admin: Option<(String, String, String)> = sqlx::query_as("SELECT username, email, password_hash FROM admins WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);
    let (username, email, password_hash) = admin.unwrap_or_else(|| ("admin".to_string(), format!("{}@admin.local", id), hash("AdminAuto@123", DEFAULT_COST).unwrap_or_default()));
    let api_key = crate::utils::card_gen::generate_api_key();
    let api_key_hash = EncryptedFieldsOps::generate_hash(&api_key);
    let email_hash = EncryptedFieldsOps::generate_hash(&email);
    let encrypted_api_key = EncryptedFieldsOps::encrypt_merchant_api_key(&state.pool, &state.encryptor, id, &api_key).await.map_err(|_| "API Key加密失败".to_string())?;
    let encrypted_email = EncryptedFieldsOps::encrypt_merchant_email(&state.pool, &state.encryptor, id, &email).await.map_err(|_| "邮箱加密失败".to_string())?;
    sqlx::query("INSERT INTO merchants (id, username, email_encrypted, email_hash, password_hash, api_key_encrypted, api_key_hash, email_verified, status, plan) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,'active','free') ON CONFLICT (id) DO NOTHING")
        .bind(id)
        .bind(username)
        .bind(encrypted_email)
        .bind(email_hash)
        .bind(password_hash)
        .bind(encrypted_api_key)
        .bind(api_key_hash)
        .execute(&state.pool)
        .await
        .map_err(|e| format!("创建管理员商户记录失败: {}", e))?;
    let _ = sqlx::query("UPDATE admins SET api_key = $1 WHERE id = $2").bind(&api_key).bind(id).execute(&state.pool).await;
    Ok(id)
}

async fn list_apps(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Query(q): Query<AppQuery>,
) -> Json<Value> {
    let merchant_id = if claims.role == "admin" {
        match ensure_admin_merchant(&state, &claims).await { Ok(id) => id, Err(msg) => return Json(json!({"success": false, "message": msg})) }
    } else {
        match Uuid::parse_str(&claims.sub) {
            Ok(id) => id,
            Err(_) => return Json(json!({"success": false, "message": "无效用户ID"})),
        }
    };
    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(20).min(100);
    let offset = (page - 1) * page_size;

    let (apps, total): (Vec<App>, i64) = {
        let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM apps WHERE merchant_id = $1")
            .bind(merchant_id)
            .fetch_one(&state.pool)
            .await
            .unwrap_or((0,));
        let apps: Vec<App> = sqlx::query_as(
            "SELECT * FROM apps WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        )
        .bind(merchant_id)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();
        (apps, total.0)
    };

    Json(json!({
        "success": true,
        "data": apps,
        "total": total,
        "page": page,
        "page_size": page_size
    }))
}

async fn create_app(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<CreateAppRequest>,
) -> Json<Value> {
    let merchant_id = if claims.role == "admin" {
        match ensure_admin_merchant(&state, &claims).await { Ok(id) => id, Err(msg) => return Json(json!({"success": false, "message": msg})) }
    } else {
        match Uuid::parse_str(&claims.sub) {
            Ok(id) => id,
            Err(_) => return Json(json!({"success": false, "message": "无效用户ID"})),
        }
    };

    if body.app_name.trim().is_empty() {
        return Json(json!({"success": false, "message": "应用名称不能为空"}));
    }

    // 非管理员检查套餐限制
    if claims.role != "admin" {
        let plan: (String,) = sqlx::query_as("SELECT plan FROM merchants WHERE id = $1")
            .bind(merchant_id)
            .fetch_one(&state.pool)
            .await
            .unwrap_or_else(|_| ("free".to_string(),));
        let config = get_config_by_plan(&state.pool, &plan.0).await;
        let app_count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM apps WHERE merchant_id = $1")
                .bind(merchant_id)
                .fetch_one(&state.pool)
                .await
                .unwrap_or((0,));
        if config.max_apps != -1 && app_count.0 >= config.max_apps as i64 {
            return Json(json!({
                "success": false,
                "message": format!("{}最多创建 {} 个应用，请升级套餐", config.label, config.max_apps)
            }));
        }
    }

    let app: Result<App, _> = sqlx::query_as(
        "INSERT INTO apps (merchant_id, app_name, description) VALUES ($1, $2, $3) RETURNING *",
    )
    .bind(merchant_id)
    .bind(&body.app_name)
    .bind(&body.description)
    .fetch_one(&state.pool)
    .await;

    match app {
        Ok(a) => Json(json!({"success": true, "data": a})),
        Err(e) => Json(json!({"success": false, "message": format!("创建失败: {}", e)})),
    }
}

async fn get_app(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Json<Value> {
    let merchant_id = if claims.role == "admin" {
        match ensure_admin_merchant(&state, &claims).await { Ok(id) => id, Err(msg) => return Json(json!({"success": false, "message": msg})) }
    } else {
        Uuid::parse_str(&claims.sub).unwrap_or_default()
    };
    let app: Option<App> = sqlx::query_as(
        "SELECT * FROM apps WHERE id = $1 AND (merchant_id = $2 OR $3 = 'admin')",
    )
    .bind(id)
    .bind(merchant_id)
    .bind(&claims.role)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    match app {
        Some(a) => Json(json!({"success": true, "data": a})),
        None => Json(json!({"success": false, "message": "应用不存在"})),
    }
}

async fn delete_app(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Json<Value> {
    let merchant_id = if claims.role == "admin" {
        match ensure_admin_merchant(&state, &claims).await { Ok(id) => id, Err(msg) => return Json(json!({"success": false, "message": msg})) }
    } else {
        Uuid::parse_str(&claims.sub).unwrap_or_default()
    };
    let result = sqlx::query(
        "DELETE FROM apps WHERE id = $1 AND (merchant_id = $2 OR $3 = 'admin')",
    )
    .bind(id)
    .bind(merchant_id)
    .bind(&claims.role)
    .execute(&state.pool)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => Json(json!({"success": true, "message": "删除成功"})),
        Ok(_) => Json(json!({"success": false, "message": "应用不存在或无权限"})),
        Err(e) => Json(json!({"success": false, "message": format!("删除失败: {}", e)})),
    }
}

async fn update_app_status(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<Value>,
) -> Json<Value> {
    let status = match body.get("status").and_then(|s| s.as_str()) {
        Some(s) if s == "active" || s == "disabled" => s.to_string(),
        _ => return Json(json!({"success": false, "message": "无效状态"})),
    };
    let merchant_id = if claims.role == "admin" {
        match ensure_admin_merchant(&state, &claims).await { Ok(id) => id, Err(msg) => return Json(json!({"success": false, "message": msg})) }
    } else {
        Uuid::parse_str(&claims.sub).unwrap_or_default()
    };

    if claims.role == "admin" {
        // 管理员禁用/启用：同步更新 admin_disabled 标记
        let admin_disabled = status == "disabled";
        let result = sqlx::query(
            "UPDATE apps SET status = $1, admin_disabled = $2, updated_at = NOW() WHERE id = $3",
        )
        .bind(&status)
        .bind(admin_disabled)
        .bind(id)
        .execute(&state.pool)
        .await;
        return match result {
            Ok(r) if r.rows_affected() > 0 => Json(json!({"success": true, "message": "状态已更新"})),
            Ok(_) => Json(json!({"success": false, "message": "应用不存在"})),
            Err(e) => Json(json!({"success": false, "message": format!("更新失败: {}", e)})),
        };
    }

    // 商户操作：不允许启用被管理员禁用的应用
    if status == "active" {
        let app: Option<(bool,)> =
            sqlx::query_as("SELECT admin_disabled FROM apps WHERE id = $1 AND merchant_id = $2")
                .bind(id)
                .bind(merchant_id)
                .fetch_optional(&state.pool)
                .await
                .unwrap_or(None);
        match app {
            Some((true,)) => return Json(json!({"success": false, "message": "该应用已被管理员禁用，无法自行启用"})),
            None => return Json(json!({"success": false, "message": "应用不存在或无权限"})),
            _ => {}
        }
    }

    let result = sqlx::query(
        "UPDATE apps SET status = $1, updated_at = NOW() WHERE id = $2 AND merchant_id = $3",
    )
    .bind(&status)
    .bind(id)
    .bind(merchant_id)
    .execute(&state.pool)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => Json(json!({"success": true, "message": "状态已更新"})),
        Ok(_) => Json(json!({"success": false, "message": "应用不存在或无权限"})),
        Err(e) => Json(json!({"success": false, "message": format!("更新失败: {}", e)})),
    }
}

/// 批量更新应用状态（单条 SQL IN 子句，防止大量请求冲击数据库）
async fn batch_update_app_status(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<BatchStatusRequest>,
) -> Json<Value> {
    if body.ids.is_empty() {
        return Json(json!({"success": false, "message": "ids 不能为空"}));
    }
    if body.ids.len() > 200 {
        return Json(json!({"success": false, "message": "单次批量操作最多 200 条"}));
    }
    let status = match body.status.as_str() {
        s if s == "active" || s == "disabled" => s.to_string(),
        _ => return Json(json!({"success": false, "message": "无效状态"})),
    };
    let merchant_id = if claims.role == "admin" {
        match ensure_admin_merchant(&state, &claims).await { Ok(id) => id, Err(msg) => return Json(json!({"success": false, "message": msg})) }
    } else {
        Uuid::parse_str(&claims.sub).unwrap_or_default()
    };

    let result = if claims.role == "admin" {
        let admin_disabled = status == "disabled";
        sqlx::query(
            "UPDATE apps SET status = $1, admin_disabled = $2, updated_at = NOW()
             WHERE id = ANY($3)",
        )
        .bind(&status)
        .bind(admin_disabled)
        .bind(&body.ids)
        .execute(&state.pool)
        .await
    } else {
        // 商户批量操作：排除被管理员禁用的应用
        if status == "active" {
            sqlx::query(
                "UPDATE apps SET status = $1, updated_at = NOW()
                 WHERE id = ANY($2) AND merchant_id = $3 AND admin_disabled = FALSE",
            )
            .bind(&status)
            .bind(&body.ids)
            .bind(merchant_id)
            .execute(&state.pool)
            .await
        } else {
            sqlx::query(
                "UPDATE apps SET status = $1, updated_at = NOW()
                 WHERE id = ANY($2) AND merchant_id = $3",
            )
            .bind(&status)
            .bind(&body.ids)
            .bind(merchant_id)
            .execute(&state.pool)
            .await
        }
    };

    match result {
        Ok(r) => Json(json!({
            "success": true,
            "message": format!("已更新 {} 个应用", r.rows_affected())
        })),
        Err(e) => Json(json!({"success": false, "message": format!("批量更新失败: {}", e)})),
    }
}
