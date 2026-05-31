use crate::middleware::auth::{AppState, auth_middleware};
use crate::utils::jwt::Claims;
use axum::{
    extract::{Multipart, State},
    middleware,
    routing::{get, post},
    Extension, Json, Router,
};
use bcrypt::{hash, verify, DEFAULT_COST};
use redis::AsyncCommands;
use serde::Deserialize;
use serde_json::{json, Value};
use rand::Rng;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct UpdateProfileRequest {
    pub username: Option<String>,
    pub email: Option<String>,
}

#[derive(Deserialize)]
pub struct ChangePasswordBody {
    pub old_password: String,
    pub new_password: String,
}

#[derive(Deserialize)]
pub struct ChangeEmailRequest {
    pub new_email: String,
    pub code: String,
}

#[derive(Deserialize)]
pub struct VerifyCodeRequest {
    pub code: String,
}

#[derive(Deserialize)]
pub struct RegenerateKeyRequest {}

pub fn profile_router(state: AppState) -> Router<AppState> {
    let auth_routes = Router::new()
        .route("/profile", get(get_profile).put(update_profile))
        .route("/profile/avatar", post(upload_avatar))
        .route("/profile/change-password", post(profile_change_password))
        .route("/profile/change-email", post(profile_change_email))
        .route("/profile/verify-old-email", post(verify_old_email))
        .route("/profile/api-key", post(regenerate_api_key))
        .route("/profile/upload-background", post(upload_background))
        .route("/profile/remove-background", post(remove_background))
        .route_layer(middleware::from_fn_with_state(state, auth_middleware));

    auth_routes
        .route("/version", get(get_version))
}

async fn get_profile(State(state): State<AppState>, Extension(_claims): Extension<Claims>) -> Json<Value> {
    let uid = &_claims.sub;
    if _claims.role == "admin" {
        let r: Option<(String, String, String, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
            "SELECT id::text, username, email, avatar_url, background_url, api_key FROM admins WHERE id::text = $1"
        )
        .bind(uid)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

        match r {
            Some((id, u, e, a, bg, ak)) => Json(json!({
                "success": true,
                "data": {
                    "id": id,
                    "username": u,
                    "email": e,
                    "avatar": a,
                    "background_url": bg,
                    "api_key": ak,
                    "user_type": "admin",
                },
            })),
            None => Json(json!({"success": false, "message": "用户不存在"})),
        }
    } else {
        let r: Option<(
            String,
            String,
            String,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
        )> = sqlx::query_as(
            "SELECT id::text, username, email_encrypted, api_key, plan, avatar_url, background_url FROM merchants WHERE id::text = $1"
        )
        .bind(uid)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

        match r {
            Some((id, u, e, k, p, a, bg)) => Json(json!({
                "success": true,
                "data": {
                    "id": id,
                    "username": u,
                    "email": e,
                    "api_key": k,
                    "plan": p,
                    "avatar": a,
                    "background_url": bg,
                    "user_type": "merchant",
                },
            })),
            None => Json(json!({"success": false, "message": "用户不存在"})),
        }
    }
}

async fn update_profile(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<UpdateProfileRequest>,
) -> Json<Value> {
    let table = if claims.role == "admin" { "admins" } else { "merchants" };
    
    // 1. 更新当前表
    if let Some(email) = &body.email {
        let col = if claims.role == "admin" { "email" } else { "email_encrypted" };
        let _ = sqlx::query(&format!("UPDATE {} SET {} = $1 WHERE id::text = $2", table, col))
            .bind(email)
            .bind(&claims.sub)
            .execute(&state.pool)
            .await;
        // 跨表同步：admin 修改 -> 同步到 merchants；merchant 修改 -> 同步到 admins
        if claims.role == "admin" {
            let uid = match uuid::Uuid::parse_str(&claims.sub) {
                Ok(id) => id,
                Err(_) => return Json(json!({"success": false})),
            };
            let _ = sqlx::query("UPDATE merchants SET email = $1, email_encrypted = $1 WHERE id = $2")
                .bind(email)
                .bind(uid)
                .execute(&state.pool)
                .await;
        } else {
            // merchant 修改邮箱 -> 同步到 admins
            let _ = sqlx::query("UPDATE admins SET email = $1 WHERE id::text = $2")
                .bind(email)
                .bind(&claims.sub)
                .execute(&state.pool)
                .await;
        }
    }
    if let Some(u) = &body.username {
        let _ = sqlx::query(&format!("UPDATE {} SET username = $1 WHERE id::text = $2", table))
            .bind(u)
            .bind(&claims.sub)
            .execute(&state.pool)
            .await;
        // 跨表同步
        if claims.role == "admin" {
            let uid = match uuid::Uuid::parse_str(&claims.sub) {
                Ok(id) => id,
                Err(_) => return Json(json!({"success": false})),
            };
            let _ = sqlx::query("UPDATE merchants SET username = $1 WHERE id = $2")
                .bind(u)
                .bind(uid)
                .execute(&state.pool)
                .await;
        } else {
            let _ = sqlx::query("UPDATE admins SET username = $1 WHERE id::text = $2")
                .bind(u)
                .bind(&claims.sub)
                .execute(&state.pool)
                .await;
        }
    }
    Json(json!({"success": true}))
}

async fn upload_avatar(
    State(state): State<AppState>,
    Extension(_claims): Extension<Claims>,
    mut mp: Multipart,
) -> Json<Value> {
    while let Some(f) = mp.next_field().await.unwrap_or(None) {
        if f.name().unwrap_or("") == "avatar" {
            let d = f.bytes().await.unwrap_or_default();
            if d.len() > 5 * 1024 * 1024 {
                return Json(json!({"success": false, "message": "不能超过5MB"}));
            }
            let ext = if d.len() > 3 && &d[0..3] == b"\xff\xd8\xff" {
                "jpg"
            } else if d.len() > 8 && &d[0..8] == b"\x89PNG\r\n\x1a\n" {
                "png"
            } else {
                return Json(json!({"success": false, "message": "格式不支持"}));
            };
            let fnm = format!("avatars/{}_{}.{}", _claims.sub, Uuid::new_v4(), ext);
            let _ = std::fs::create_dir_all("/app/uploads/avatars");
            let _ = std::fs::write(format!("/app/uploads/{}", fnm), &d);
            let url = format!("/uploads/{}", fnm);
            let tbl = if _claims.role == "admin" { "admins" } else { "merchants" };
            let _ = sqlx::query(&format!("UPDATE {} SET avatar_url = $1 WHERE id::text = $2", tbl))
                .bind(&url)
                .bind(&_claims.sub)
                .execute(&state.pool)
                .await;
            return Json(json!({"success": true, "data": {"avatar": url}}));
        }
    }
    Json(json!({"success": false}))
}

async fn profile_change_password(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<ChangePasswordBody>,
) -> Json<Value> {
    let tbl = if claims.role == "admin" { "admins" } else { "merchants" };
    let r: Option<(String,)> = sqlx::query_as(&format!("SELECT password_hash FROM {} WHERE id::text = $1", tbl))
        .bind(&claims.sub)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

    match r {
        Some((h,)) => {
            if !verify(&body.old_password, &h).unwrap_or(false) {
                return Json(json!({"success": false, "message": "原密码���误"}));
            }
            let nh = hash(&body.new_password, DEFAULT_COST).unwrap();
            let _ = sqlx::query(&format!("UPDATE {} SET password_hash = $1 WHERE id::text = $2", tbl))
                .bind(&nh)
                .bind(&claims.sub)
                .execute(&state.pool)
                .await;
            Json(json!({"success": true, "message": "密码修改成功"}))
        }
        None => Json(json!({"success": false, "message": "用户不存在"})),
    }
}

async fn verify_old_email(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<VerifyCodeRequest>,
) -> Json<Value> {
    let email = claims.sub.clone();
    let mut c = state.redis.clone();
    let k = format!("email-change:{}", email);
    let sc: Option<String> = c.get(&k).await.unwrap_or(None);
    match sc {
        Some(v) if v == body.code => {
            let _: () = c.del(&k).await.unwrap_or(());
            Json(json!({"success": true}))
        }
        _ => Json(json!({"success": false, "message": "验证码错误或已过期"})),
    }
}

async fn profile_change_email(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<ChangeEmailRequest>,
) -> Json<Value> {
    let mut c = state.redis.clone();
    let k = format!("email-code:{}", body.new_email);
    let sc: Option<String> = c.get(&k).await.unwrap_or(None);
    match sc {
        Some(v) if v == body.code => {
            let _: () = c.del(&k).await.unwrap_or(());
            let old_email = claims.sub.clone();
            
            // 管理员：直接更新邮箱，同时同步到 merchants 表
            if claims.role == "admin" {
                let _ = sqlx::query("UPDATE admins SET email = $1 WHERE id::text = $2")
                    .bind(&body.new_email)
                    .bind(&old_email)
                    .execute(&state.pool)
                    .await;
                // 同步更新 merchants 表的 email 和 email_encrypted
                let uid = match uuid::Uuid::parse_str(&old_email) {
                    Ok(id) => id,
                    Err(_) => return Json(json!({"success": false, "message": "无效用户ID"})),
                };
                let _ = sqlx::query("UPDATE merchants SET email = $1, email_encrypted = $1 WHERE id = $2")
                    .bind(&body.new_email)
                    .bind(uid)
                    .execute(&state.pool)
                    .await;
                return Json(json!({"success": true}));
            }
            
            // 商户：数据迁移到新邮箱
            // 1. 找出旧商户
            let old_merchant: Option<(uuid::Uuid,)> = sqlx::query_as(
                "SELECT id FROM merchants WHERE email_encrypted = $1"
            )
            .bind(&old_email)
            .fetch_optional(&state.pool)
            .await
            .unwrap_or(None);
            
            if let Some((old_id,)) = old_merchant {
                // 2. 检查新邮箱是否已有商户记录
                let existing: Option<(uuid::Uuid,)> = sqlx::query_as(
                    "SELECT id FROM merchants WHERE email_encrypted = $1"
                )
                .bind(&body.new_email)
                .fetch_optional(&state.pool)
                .await
                .unwrap_or(None);
                
                if let Some((new_id,)) = existing {
                    // 已有记录：把旧商户的 apps/cards/activations 转移到新商户
                    let _ = sqlx::query("UPDATE apps SET merchant_id = $1 WHERE merchant_id = $2")
                        .bind(new_id).bind(old_id).execute(&state.pool).await;
                    let _ = sqlx::query("UPDATE cards SET merchant_id = $1 WHERE merchant_id = $2")
                        .bind(new_id).bind(old_id).execute(&state.pool).await;
                    let _ = sqlx::query(
                        "UPDATE activations SET card_id = cards.id FROM cards WHERE cards.merchant_id = $1"
                    )
                    .bind(new_id).execute(&state.pool).await;
                    // 删除旧商户
                    let _ = sqlx::query("DELETE FROM merchants WHERE id = $1")
                        .bind(old_id).execute(&state.pool).await;
                } else {
                    // 直接更新邮箱
                    let _ = sqlx::query("UPDATE merchants SET email_encrypted = $1 WHERE id = $2")
                        .bind(&body.new_email).bind(old_id).execute(&state.pool).await;
                }
            }
            
            // 商户换绑邮箱成功，同步更新 admins 表的 email
            let _ = sqlx::query("UPDATE admins SET email = $1 WHERE id::text = $2")
                .bind(&body.new_email)
                .bind(&old_email)
                .execute(&state.pool)
                .await;
            
            Json(json!({"success": true}))
        }
        _ => Json(json!({"success": false, "message": "验证码错误或已过期"})),
    }
}

async fn regenerate_api_key(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Json<Value> {
    let nk: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();
    if claims.role == "admin" {
        let _ = sqlx::query("UPDATE admins SET api_key = $1 WHERE id::text = $2")
            .bind(&nk)
            .bind(&claims.sub)
            .execute(&state.pool)
            .await;
        // 同步更新 merchants 表的 api_key_encrypted（加密后写入）
        let uid = match uuid::Uuid::parse_str(&claims.sub) {
            Ok(id) => id,
            Err(_) => return Json(json!({"success": false, "message": "无效用户ID"})),
        };
        if let Ok(encrypted) = crate::db::encrypted_fields::EncryptedFieldsOps::encrypt_merchant_api_key(
            &state.pool, &state.encryptor, uid, &nk,
        ).await {
            let _ = sqlx::query("UPDATE merchants SET api_key_encrypted = $1 WHERE id = $2")
                .bind(&encrypted)
                .bind(uid)
                .execute(&state.pool)
                .await;
        }
        return Json(json!({"success": true, "data": {"api_key": nk}}));
    }
    // merchant 加密存储
    let uid = Uuid::parse_str(&claims.sub).unwrap_or_default();
    let encrypted = match crate::db::encrypted_fields::EncryptedFieldsOps::encrypt_merchant_api_key(
        &state.pool,
        &state.encryptor,
        uid,
        &nk,
    ).await {
        Ok(e) => e,
        Err(_) => return Json(json!({"success": false, "message": "加密失败"})),
    };
    let _ = sqlx::query("UPDATE merchants SET api_key_encrypted = $1 WHERE id = $2")
        .bind(&encrypted)
        .bind(uid)
        .execute(&state.pool)
        .await;
    // 同步更新 admins 表的 api_key（如果存在对应 admin 记录）
    let _ = sqlx::query("UPDATE admins SET api_key = $1 WHERE id::text = $2")
        .bind(&nk)
        .bind(&claims.sub)
        .execute(&state.pool)
        .await;
    Json(json!({"success": true, "data": {"api_key": nk}}))
}

async fn upload_background(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    mut mp: Multipart,
) -> Json<Value> {
    while let Some(f) = mp.next_field().await.unwrap_or(None) {
        if f.name().unwrap_or("") == "background" {
            let d = f.bytes().await.unwrap_or_default();
            if d.len() > 10 * 1024 * 1024 {
                return Json(json!({"success": false, "message": "不能超过10MB"}));
            }
            let ext = "jpg";
            let fnm = format!("backgrounds/{}_{}.{}", claims.sub, Uuid::new_v4(), ext);
            let _ = std::fs::create_dir_all("/app/uploads/backgrounds");
            let _ = std::fs::write(format!("/app/uploads/{}", fnm), &d);
            let url = format!("/uploads/{}", fnm);
            return Json(json!({"success": true, "data": {"background_url": url}}));
        }
    }
    Json(json!({"success": false, "message": "未找到文件"}))
}

async fn remove_background(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Json<Value> {
    // 从数据库获取当前背景路径
    let tbl = if claims.role == "admin" { "admins" } else { "merchants" };
    let bg: Option<(Option<String>,)> = sqlx::query_as(
        &format!("SELECT background_url FROM {} WHERE id::text = $1", tbl)
    )
    .bind(&claims.sub)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    // 删除文���
    if let Some((Some(url),)) = bg {
        let file_path = format!("/app/{}", url.trim_start_matches('/'));
        let _ = std::fs::remove_file(&file_path);
    }

    // 清空数据库字段
    let _ = sqlx::query(&format!("UPDATE {} SET background_url = NULL WHERE id::text = $1", tbl))
        .bind(&claims.sub)
        .execute(&state.pool)
        .await;

    Json(json!({"success": true}))
}

async fn get_version() -> Json<Value> {
    let ver = std::fs::read_to_string("/app/CHANGELOG.md")
        .ok()
        .and_then(|content| {
            for line in content.lines() {
                if let Some(rest) = line.strip_prefix("## [") {
                    if let Some(end) = rest.find(']') {
                        let tag = &rest[..end];
                        let ver = if tag == "未发布" || tag == "最��" {
                            continue;
                        } else {
                            tag.trim_start_matches('v')
                        };
                        if !ver.is_empty() {
                            return Some(ver.to_string());
                        }
                    }
                }
            }
            None
        })
        .unwrap_or_else(|| "0.1.0".to_string());
    Json(json!({"success": true, "data": {"version": ver}}))
}