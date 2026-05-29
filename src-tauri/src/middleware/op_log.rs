use axum::{
    extract::{Request, State},
    http::Method,
    middleware::Next,
    response::Response,
};
use crate::middleware::auth::AppState;
use crate::utils::jwt::{verify_token, Claims};
use crate::utils::op_log::log_operation;
use uuid::Uuid;

pub async fn op_log_middleware(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    println!("[OP_LOG] Intercepted {} {}", method, path);

    let claims = req
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .and_then(|t| verify_token(t, &state.jwt_secret).ok());

    let response = next.run(req).await;

    if response.status().is_success() {
        let (action, detail) = classify_action(&method, &path);
        let module = classify_module(&path);
        let user_type = if let Some(ref c) = claims {
            if c.role == "admin" { "admin" } else { "merchant" }
        } else { "visitor" };
        let user_id = claims.as_ref().and_then(|c| Uuid::parse_str(&c.sub).ok());
        let pool = state.pool.clone();
        tokio::spawn(async move {
            println!("[OP_LOG] Writing: action={} module={} detail={} user_id={:?}", action, module, detail, user_id);
            log_operation(&pool, user_type, user_id, &action, &module, &detail, "").await;
            println!("[OP_LOG] Write done");
        });
    }
    response
}

fn classify_action(method: &Method, path: &str) -> (String, String) {
    if path.contains("/auth/login") { return ("login".into(), "登录系统".into()); }
    if path.contains("/auth/register") { return ("register".into(), "注册新账号".into()); }
    if path.contains("/auth/logout") { return ("logout".into(), "退出登录".into()); }
    if path.contains("/auth/reset-password") { return ("reset_password".into(), "重置密码".into()); }
    if path.contains("/admin/merchants") && path.contains("/plan") { return ("update_plan".into(), "修改商户套餐".into()); }
    if path.contains("/admin/merchants") && path.contains("/status") { return ("update_status".into(), "修改商户状态".into()); }
    if path.contains("/admin/merchants") {
        match *method {
            Method::POST => return ("create".into(), "新建商户".into()),
            Method::PUT => return ("update".into(), "修改商户信息".into()),
            _ => {}
        }
    }
    if path.contains("/apps") {
        match *method {
            Method::POST => return ("create".into(), "新建应用".into()),
            Method::PUT => return ("update".into(), "修改应用信息".into()),
            Method::DELETE => return ("delete".into(), "删除应用".into()),
            _ => {}
        }
    }
    if path.contains("/cards/batch") {
        match *method {
            Method::POST => return ("create".into(), "批量创建卡密".into()),
            Method::DELETE => return ("delete".into(), "批量删除卡密".into()),
            _ => {}
        }
    }
    if path.contains("/cards") {
        match *method {
            Method::POST => return ("create".into(), "创建卡密".into()),
            Method::PUT => return ("update".into(), "修改卡密".into()),
            Method::DELETE => return ("delete".into(), "删除卡密".into()),
            _ => {}
        }
    }
    if path.contains("/keys") {
        match *method {
            Method::POST => return ("create".into(), "新建API密钥".into()),
            Method::PUT => return ("update".into(), "修改API密钥".into()),
            Method::DELETE => return ("delete".into(), "删除API密钥".into()),
            _ => {}
        }
    }
    if path.contains("/merchant/regenerate") { return ("regenerate".into(), "重新生成API Key".into()); }
    if path.contains("/blacklist") && !path.contains("/ips") && !path.contains("/devices") && !path.contains("/alerts") {
        match *method {
            Method::POST => return ("add".into(), "添加黑名单".into()),
            Method::DELETE => return ("remove".into(), "移除黑名单".into()),
            _ => {}
        }
    }
    if path.contains("/whitelist") {
        match *method {
            Method::POST => return ("add".into(), "添加白名单".into()),
            Method::DELETE => return ("remove".into(), "移除白名单".into()),
            _ => {}
        }
    }
    if path.contains("/merchant/change-password") { return ("change_password".into(), "修改密码".into()); }
    if path.contains("/merchant/profile") { return ("update_profile".into(), "修改账号信息".into()); }
    if path.contains("/messages") {
        match *method {
            Method::POST => return ("send".into(), "发送消息".into()),
            Method::PUT => return ("update".into(), "修改消息".into()),
            Method::DELETE => return ("delete".into(), "删除消息".into()),
            _ => {}
        }
    }
    if path.contains("/alerts") {
        match *method {
            Method::PUT => return ("update".into(), "修改告警状态".into()),
            Method::DELETE => return ("delete".into(), "删除告警".into()),
            _ => {}
        }
    }
    if path.contains("/v1/activate") { return ("activate".into(), "接口激活".into()); }
    if path.contains("/v1/verify") { return ("verify".into(), "接口验证".into()); }
    if path.contains("/v1/unbind") { return ("unbind".into(), "接口解绑".into()); }
    if path.contains("/v1/heartbeat") { return ("heartbeat".into(), "接口心跳".into()); }
    if path.contains("/ts/sign") { return ("sign".into(), "接口签名".into()); }
    if path.contains("/ts/encrypt") { return ("encrypt".into(), "接口加密".into()); }
    if path.contains("/ts/decrypt") { return ("decrypt".into(), "接口解密".into()); }
    match *method {
        Method::POST => ("create".into(), format!("新建数据: {}", path)),
        Method::PUT | Method::PATCH => ("update".into(), format!("修改数据: {}", path)),
        Method::DELETE => ("delete".into(), format!("删除数据: {}", path)),
        _ => ("other".into(), path.to_string()),
    }
}

fn classify_module(path: &str) -> String {
    if path.contains("/auth") { "认证".into() }
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
    else if path.contains("/whitelist") { "风控管理".into() }
    else if path.contains("/messages") { "消息中心".into() }
    else if path.contains("/activations") { "激活记录".into() }
    else if path.contains("/v1/activate") { "接口调用-激活".into() }
    else if path.contains("/v1/verify") { "接口调用-验证".into() }
    else if path.contains("/v1/unbind") { "接口调用-解绑".into() }
    else if path.contains("/v1/heartbeat") { "接口调用-心跳".into() }
    else if path.contains("/ts/sign") { "接口调用-签名".into() }
    else if path.contains("/ts/encrypt") { "接口调用-加密".into() }
    else if path.contains("/ts/decrypt") { "接口调用-解密".into() }
    else { "其他操作".into() }
}
