use axum::{
    extract::{Request, State},
    http::Method,
    middleware::Next,
    response::Response,
};
use crate::middleware::auth::AppState;
use crate::utils::jwt::verify_token;
use crate::utils::op_log::log_operation;
use uuid::Uuid;

pub async fn op_log_middleware(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let method_str = method.as_str().to_string();

    let claims = req
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .and_then(|t| verify_token(t, &state.jwt_secret).ok());

    let response = next.run(req).await;

    if response.status().is_success() {
        if let Some(claims) = claims {
            let action = match method {
                Method::POST => "create",
                Method::PUT => "update",
                Method::PATCH => "update",
                Method::DELETE => "delete",
                _ => return response,
            };
            let user_type = if claims.role == "admin" { "admin" } else { "merchant" };
            let user_id = Uuid::parse_str(&claims.sub).ok();
            let module = classify_module(&path);
            let detail = format!("{} {}", method_str, path);
            let pool = state.pool.clone();

            tokio::spawn(async move {
                log_operation(&pool, user_type, user_id, action, &module, &detail, "").await;
            });
        }
    }
    response
}

fn classify_module(path: &str) -> String {
    if path.contains("/auth/login") { "认证".into() }
    else if path.contains("/auth/register") { "认证".into() }
    else if path.contains("/auth/reset-password") { "认证".into() }
    else if path.contains("/auth") { "认证".into() }
    else if path.contains("/admin/merchants") { "商户管理".into() }
    else if path.contains("/admin/blacklist") { "管理员黑名单".into() }
    else if path.contains("/admin/whitelist") { "管理员白名单".into() }
    else if path.contains("/admin/messages") { "消息管理".into() }
    else if path.contains("/admin/plan") { "套餐配置".into() }
    else if path.contains("/admin/alerts") { "异常告警".into() }
    else if path.contains("/admin/risk") { "风控设置".into() }
    else if path.contains("/admin/op-logs") { "操作日志".into() }
    else if path.contains("/admin") { "管理员操作".into() }
    else if path.contains("/merchant/change-password") { "修改密码".into() }
    else if path.contains("/merchant/regenerate") { "API管理".into() }
    else if path.contains("/merchant/profile") { "账号设置".into() }
    else if path.contains("/merchant/op-logs") { "操作日志".into() }
    else if path.contains("/merchant") { "商户操作".into() }
    else if path.contains("/apps") { "应用管理".into() }
    else if path.contains("/cards") { "卡密管理".into() }
    else if path.contains("/keys") { "API管理".into() }
    else if path.contains("/blacklist") { "风控管理".into() }
    else if path.contains("/agent") { "代理管理".into() }
    else if path.contains("/plan-configs") { "套餐配置".into() }
    else if path.contains("/messages") { "消息中心".into() }
    else if path.contains("/activations") { "激活记录".into() }
    else if path.contains("/v1/activate") { "接口调用-激活".into() }
    else if path.contains("/v1/verify") { "接口调用-验证".into() }
    else if path.contains("/v1/unbind") { "接口调用-解绑".into() }
    else if path.contains("/v1/heartbeat") { "接口调用-心跳".into() }
    else { "其他操作".into() }
}
