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

#[derive(Deserialize)]
pub struct UpdateProfileRequest {
    pub username: Option<String>,
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
pub struct SendCodeRequest {
    pub email: String,
}

#[derive(Deserialize)]
pub struct VerifyCodeRequest {
    pub code: String,
}

#[derive(Deserialize)]
pub struct RegenerateKeyRequest {}

pub fn profile_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/profile", get(get_profile).put(update_profile))
        .route("/profile/avatar", post(upload_avatar))
        .route("/profile/change-password", post(profile_change_password))
        .route("/profile/change-email", post(profile_change_email))
        .route("/profile/verify-old-email", post(verify_old_email))
        .route("/profile/send-email-code", post(send_email_code))
        .route("/profile/api-key", post(regenerate_api_key))
        .route("/profile/upload-background", post(upload_background))
        .route("/version", get(get_version))
        .route_layer(middleware::from_fn_with_state(state, auth_middleware))
}

async fn get_profile(State(state): State<AppState>, Extension(_claims): Extension<Claims>) -> Json<Value> {
    let uid = &_claims.sub;
    if _claims.role == "admin" {
        let r: Option<(String, String, String, Option<String>)> = sqlx::query_as(
            "SELECT id::text, username, email, avatar_url FROM admins WHERE id::text = $1"
        )
        .bind(uid)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

        match r {
            Some((id, u, e, a)) => Json(json!({
                "success": true,
                "data": {
                    "id": id,
                    "username": u,
                    "email": e,
                    "avatar": a,
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
        )> = sqlx::query_as(
            "SELECT id::text, username, email_encrypted, api_key, plan, avatar_url FROM merchants WHERE id::text = $1"
        )
        .bind(uid)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

        match r {
            Some((id, u, e, k, p, a)) => Json(json!({
                "success": true,
                "data": {
                    "id": id,
                    "username": u,
                    "email": e,
                    "api_key": k,
                    "plan": p,
                    "avatar": a,
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
    if let Some(u) = &body.username {
        let _ = sqlx::query(&format!("UPDATE {} SET username = $1 WHERE id::text = $2", table))
            .bind(u)
            .bind(&claims.sub)
            .execute(&state.pool)
            .await;
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
            let fnm = format!("avatars/{}.{}", _claims.sub, ext);
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
                return Json(json!({"success": false, "message": "原密码错误"}));
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

async fn send_email_code(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<SendCodeRequest>,
) -> Json<Value> {
    if !body.email.contains('@') {
        return Json(json!({"success": false, "message": "邮箱格式无效"}));
    }
    let code = format!("{:06}", rand::thread_rng().gen_range(0..1_000_000));
    let mut c = state.redis.clone();
    let _: () = c
        .set_ex(format!("email-change:{}", body.email), &code, 300)
        .await
        .unwrap_or(());
    let _ = crate::utils::mailer::send_verify_code(&state.mailer, &body.email, &code).await;
    Json(json!({"success": true}))
}

async fn profile_change_email(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<ChangeEmailRequest>,
) -> Json<Value> {
    let mut c = state.redis.clone();
    let k = format!("email-change:{}", body.new_email);
    let sc: Option<String> = c.get(&k).await.unwrap_or(None);
    match sc {
        Some(code) if code == body.code => {
            let _: () = c.del(&k).await.unwrap_or(());
            let tbl = if claims.role == "admin" { "admins" } else { "merchants" };
            let _ = sqlx::query(&format!("UPDATE {} SET email = $1 WHERE id::text = $2", tbl))
                .bind(&body.new_email)
                .bind(&claims.sub)
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
    let nk = crate::utils::card_gen::generate_api_key();
    let _ = sqlx::query("UPDATE merchants SET api_key = $1 WHERE id::text = $2")
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
            let fnm = format!("backgrounds/{}.{}", claims.sub, ext);
            let _ = std::fs::create_dir_all("/app/uploads/backgrounds");
            let _ = std::fs::write(format!("/app/uploads/{}", fnm), &d);
            let url = format!("/uploads/{}", fnm);
            return Json(json!({"success": true, "data": {"background_url": url}}));
        }
    }
    Json(json!({"success": false, "message": "未找到文件"}))
}

async fn get_version() -> Json<Value> {
    Json(json!({"success": true, "data": {"version": "0.1.0"}}))
}
