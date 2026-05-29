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
    // 认证相关
    if path.contains("/auth/login") { return ("login".into(), "登录系统".into()); }
    if path.contains("/auth/register") { return ("register".into(), "注册新账号".into()); }
    if path.contains("/auth/logout") { return ("logout".into(), "退出登录".into()); }
    if path.contains("/auth/reset-password") { return ("reset_password".into(), "重置密码".into()); }

    // 前端主动上报的日志
    if path.contains("/frontend-log") {
        // 这个由请求体决定，这里先返回一个占位
        return ("other".into(), "前端操作".into());
    }

    // 管理员 - 商户管理
    if path.contains("/admin/merchants") && path.contains("/plan") { return ("update_plan".into(), "修改商户套餐".into()); }
    if path.contains("/admin/merchants") && path.contains("/status") { return ("update_status".into(), "修改商户状态".into()); }
    if path.contains("/admin/merchants") {
        match *method {
            Method::POST => return ("create".into(), "新建商户".into()),
            Method::PUT => return ("update".into(), "修改商户信息".into()),
            Method::DELETE => return ("delete".into(), "删除商户".into()),
            Method::GET => return ("view".into(), "查看商户列表".into()),
            _ => {}
        }
    }

    // 管理员 - 黑白名单
    if path.contains("/admin/blacklist") {
        match *method {
            Method::POST => return ("add".into(), "添加黑名单".into()),
            Method::DELETE => return ("remove".into(), "移除黑名单".into()),
            Method::GET => return ("view".into(), "查看黑名单".into()),
            _ => {}
        }
    }
    if path.contains("/admin/whitelist") {
        match *method {
            Method::POST => return ("add".into(), "添加白名单".into()),
            Method::DELETE => return ("remove".into(), "移除白名单".into()),
            Method::GET => return ("view".into(), "查看白名单".into()),
            _ => {}
        }
    }

    // 管理员 - 告警
    if path.contains("/admin/alerts") {
        match *method {
            Method::POST => return ("update".into(), "标记告警已读".into()),
            Method::GET => return ("view".into(), "查看异常告警".into()),
            _ => {}
        }
    }

    // 管理员 - 套餐配置
    if path.contains("/admin/plan") {
        match *method {
            Method::POST => return ("update".into(), "修改套餐配置".into()),
            Method::GET => return ("view".into(), "查看套餐配置".into()),
            _ => {}
        }
    }

    // 管理员 - 风控设置
    if path.contains("/admin/risk") {
        match *method {
            Method::POST => return ("update".into(), "修改风控设置".into()),
            Method::GET => return ("view".into(), "查看风控设置".into()),
            _ => {}
        }
    }

    // 管理员 - 消息管理
    if path.contains("/admin/messages") {
        match *method {
            Method::POST => return ("send".into(), "发送消息".into()),
            Method::PUT => return ("update".into(), "修改消息".into()),
            Method::DELETE => return ("delete".into(), "删除消息".into()),
            Method::GET => return ("view".into(), "查看消息列表".into()),
            _ => {}
        }
    }

    // 管理员 - 操作日志
    if path.contains("/admin/op-logs") {
        match *method {
            Method::GET => return ("view".into(), "查看全局操作日志".into()),
            _ => {}
        }
    }

    // 管理员 - 统计
    if path.contains("/admin/stats") {
        return ("view".into(), "查看平台统计数据".into());
    }

    // 商户相关
    if path.contains("/merchant/change-password") { return ("change_password".into(), "修改登录密码".into()); }
    if path.contains("/merchant/regenerate") { return ("regenerate".into(), "重新生成API Key".into()); }
    if path.contains("/merchant/profile") {
        match *method {
            Method::PUT => return ("update".into(), "修改账号信息".into()),
            Method::GET => return ("view".into(), "查看账号信息".into()),
            _ => {}
        }
    }
    if path.contains("/merchant/op-logs") { return ("view".into(), "查看操作日志".into()); }
    if path.contains("/merchant/dashboard-stats") { return ("view".into(), "查看商户统计数据".into()); }

    // 应用管理
    if path.contains("/apps") {
        match *method {
            Method::POST => return ("create".into(), "新建应用".into()),
            Method::PUT => return ("update".into(), "修改应用信息".into()),
            Method::DELETE => return ("delete".into(), "删除应用".into()),
            Method::GET => return ("view".into(), "查看应用列表".into()),
            _ => {}
        }
    }

    // 卡密管理
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
            Method::PUT => return ("update".into(), "修改卡密信息".into()),
            Method::DELETE => return ("delete".into(), "删除卡密".into()),
            Method::GET => return ("view".into(), "查看卡密列表".into()),
            _ => {}
        }
    }

    // API管理
    if path.contains("/keys") {
        match *method {
            Method::POST => return ("create".into(), "新建API Key".into()),
            Method::PUT => return ("update".into(), "修改API Key".into()),
            Method::DELETE => return ("delete".into(), "删除API Key".into()),
            Method::GET => return ("view".into(), "查看API Key列表".into()),
            _ => {}
        }
    }

    // 风控管理（商户）
    if path.contains("/blacklist") && !path.contains("/admin/") {
        match *method {
            Method::POST => return ("add".into(), "添加黑名单规则".into()),
            Method::DELETE => return ("remove".into(), "移除黑名单规则".into()),
            Method::GET => return ("view".into(), "查看黑名单列表".into()),
            _ => {}
        }
    }
    if path.contains("/whitelist") && !path.contains("/admin/") {
        match *method {
            Method::POST => return ("add".into(), "添加白名单规则".into()),
            Method::DELETE => return ("remove".into(), "移除白名单规则".into()),
            Method::GET => return ("view".into(), "查看白名单列表".into()),
            _ => {}
        }
    }

    // 消息中心（商户）
    if path.contains("/messages") && !path.contains("/admin/") {
        match *method {
            Method::GET => return ("view".into(), "查看消息列表".into()),
            Method::PUT => return ("update".into(), "修改消息状态".into()),
            _ => {}
        }
    }

    // 激活记录
    if path.contains("/activations") {
        match *method {
            Method::GET => return ("view".into(), "查看激活记录".into()),
            _ => {}
        }
    }

    // 接口调用
    if path.contains("/v1/activate") { return ("activate".into(), "接口调用-激活卡密".into()); }
    if path.contains("/v1/verify") { return ("verify".into(), "接口调用-验证卡密".into()); }
    if path.contains("/v1/unbind") { return ("unbind".into(), "接口调用-解绑设备".into()); }
    if path.contains("/v1/heartbeat") { return ("heartbeat".into(), "接口调用-设备心跳".into()); }
    if path.contains("/ts/sign") { return ("sign".into(), "接口调用-参数签名".into()); }
    if path.contains("/ts/encrypt") { return ("encrypt".into(), "接口调用-数据加密".into()); }
    if path.contains("/ts/decrypt") { return ("decrypt".into(), "接口调用-数据解密".into()); }

    // 兜底
    match *method {
        Method::GET => ("view".into(), format!("查看: {}", path)),
        Method::POST => ("create".into(), format!("新建: {}", path)),
        Method::PUT | Method::PATCH => ("update".into(), format!("修改: {}", path)),
        Method::DELETE => ("delete".into(), format!("删除: {}", path)),
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
