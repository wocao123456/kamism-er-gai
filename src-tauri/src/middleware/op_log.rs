use axum::{body::Body, extract::{Request, State}, http::Method, middleware::Next, response::Response};
use bytes::Bytes;
use serde_json::Value as JsonValue;
use crate::middleware::auth::AppState;
use crate::utils::jwt::verify_token;
use crate::utils::op_log::log_operation;
use uuid::Uuid;

pub async fn op_log_middleware(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let is_write = matches!(method, Method::POST | Method::PUT | Method::PATCH | Method::DELETE);

    // 读请求体并放回，让下游 handler 正常消费
    let body_json: Option<JsonValue> = if is_write {
        match req.body_mut().collect().await {
            Ok(collected) => {
                let bytes: Bytes = collected.into();
                let json = serde_json::from_slice(&bytes).ok();
                *req.body_mut() = Body::from(bytes);
                json
            }
            Err(_) => None,
        }
    } else {
        None
    };

    let claims = req
        .headers().get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .and_then(|t| verify_token(t, &state.jwt_secret).ok());

    let response = next.run(req).await;

    if response.status().is_success() {
        let (action, detail) = classify_action(&method, &path, body_json.as_ref());
        let module = classify_module(&path);
        let user_type = if let Some(ref c) = claims {
            if c.role == "admin" { "admin" } else { "merchant" }
        } else { "visitor" };
        let user_id = claims.as_ref().and_then(|c| Uuid::parse_str(&c.sub).ok());
        let pool = state.pool.clone();
        tokio::spawn(async move {
            println!("[OP_LOG] {} | {} | {} | {:?}", action, module, detail, user_id);
            log_operation(&pool, user_type, user_id, &action, &module, &detail, "").await;
        });
    }
    response
}

// ── 工具函数 ──

fn bf(body: Option<&JsonValue>, key: &str) -> String {
    body.and_then(|b| b.get(key)).and_then(|v| v.as_str()).unwrap_or("").to_string()
}

fn bi(body: Option<&JsonValue>, key: &str) -> Option<i64> {
    body.and_then(|b| b.get(key)).and_then(|v| v.as_i64())
}

fn short_id(id: &str) -> &str {
    if id.len() > 8 { &id[..8] } else { id }
}

fn get_id(path: &str) -> String {
    path.trim_matches('/').split('/').last()
        .filter(|s| s.len() > 20 && s.contains('-'))
        .unwrap_or("").to_string()
}

// ── 分类：action + 中文detail ──

fn classify_action(method: &Method, path: &str, body: Option<&JsonValue>) -> (String, String) {
    let id = get_id(path);
    let sid = short_id(&id);
    let name = bf(body, "name");
    let email = bf(body, "email");
    let value = bf(body, "value");
    let tp = bf(body, "tp");
    let prefix = bf(body, "prefix");
    let plan = bf(body, "plan");
    let status = bf(body, "status");
    let title = bf(body, "title");
    let card_key = { let v = bf(body, "card_key"); if v.is_empty() { bf(body, "key") } else { v } };
    let app_id = bf(body, "app_id");
    let count = bi(body, "count");
    let key = bf(body, "key");
    let setting_key = { let v = bf(body, "setting_key"); if v.is_empty() { bf(body, "key") } else { v } };

    // ── 认证 ──
    if path.contains("/auth/login") {
        return ("login".into(), if email.is_empty() { "登录系统".into() } else { format!("登录系统 ({})", email) });
    }
    if path.contains("/auth/register") {
        return ("register".into(), format!("注册新账号 ({})", email));
    }
    if path.contains("/auth/logout") { return ("logout".into(), "退出登录".into()); }
    if path.contains("/auth/reset-password") { return ("reset_password".into(), "重置密码".into()); }

    // ── 前端上报 ──
    if path.contains("/frontend-log") {
        let a = bf(body, "action");
        let d = bf(body, "detail");
        let act = if a.is_empty() { "view".to_string() } else { a };
        let det = if d.is_empty() { "前端页面操作".to_string() } else { d };
        return (act, det);
    }

    // ── 管理员 - 商户 ──
    if path.contains("/admin/merchants") && path.contains("/plan") {
        return ("update".into(), format!("修改商户套餐为 {}", plan));
    }
    if path.contains("/admin/merchants") && path.contains("/status") {
        return ("update".into(), format!("修改商户状态为 {}", status));
    }
    if path.contains("/admin/merchants") {
        return match *method {
            Method::POST => ("create".into(), format!("新建商户 ({})", email)),
            Method::PUT => ("update".into(), format!("修改商户「{}」", if name.is_empty() { sid } else { &name })),
            Method::DELETE => ("delete".into(), format!("删除商户 {}", sid)),
            _ => ("view".into(), "查看商户列表".into()),
        };
    }

    // ── 管理员 - 黑白名单 ──
    if path.contains("/admin/blacklist") {
        return match *method {
            Method::POST => ("add".into(), format!("添加{}「{}」到黑名单", tp_label(&tp), value)),
            Method::DELETE => ("remove".into(), format!("从黑名单移除 {}", sid)),
            _ => ("view".into(), "查看黑名单列表".into()),
        };
    }
    if path.contains("/admin/whitelist") {
        return match *method {
            Method::POST => ("add".into(), format!("添加{}「{}」到白名单", tp_label(&tp), value)),
            Method::DELETE => ("remove".into(), format!("从白名单移除 {}", sid)),
            _ => ("view".into(), "查看白名单列表".into()),
        };
    }

    // ── 管理员 - 告警 ──
    if path.contains("/admin/alerts") {
        return match *method {
            Method::POST | Method::PATCH => ("update".into(), format!("标记告警 {} 为已读", sid)),
            _ => ("view".into(), "查看异常告警列表".into()),
        };
    }

    // ── 管理员 - 套餐/风控/消息 ──
    if path.contains("/admin/plan") {
        return match *method {
            Method::POST => ("update".into(), "修改套餐配置".into()),
            _ => ("view".into(), "查看套餐配置".into()),
        };
    }
    if path.contains("/admin/risk") {
        return match *method {
            Method::POST => ("update".into(), format!("修改风控设置「{}」", bf(body, "key"))),
            _ => ("view".into(), "查看风控设置".into()),
        };
    }
    if path.contains("/admin/messages") {
        return match *method {
            Method::POST => ("send".into(), format!("发送消息「{}」", title)),
            Method::PUT => ("update".into(), format!("修改消息「{}」", title)),
            Method::DELETE => ("delete".into(), format!("删除消息 {}", sid)),
            _ => ("view".into(), "查看消息列表".into()),
        };
    }
    if path.contains("/admin/op-logs") { return ("view".into(), "查看全局操作日志".into()); }
    if path.contains("/admin/stats") { return ("view".into(), "查看平台统计数据".into()); }

    // ── 商户 ──
    if path.contains("/merchant/change-password") { return ("update".into(), "修改登录密码".into()); }
    if path.contains("/merchant/regenerate") { return ("regenerate".into(), "重新生成 API Key".into()); }
    if path.contains("/merchant/profile") {
        return match *method {
            Method::PUT => ("update".into(), "修改账号信息".into()),
            _ => ("view".into(), "查看账号信息".into()),
        };
    }
    if path.contains("/merchant/op-logs") { return ("view".into(), "查看操作日志".into()); }
    if path.contains("/merchant/dashboard-stats") { return ("view".into(), "查看商户统计数据".into()); }

    // ── 应用管理 ──
    if path.contains("/apps") {
        return match *method {
            Method::POST => ("create".into(), format!("新建应用「{}」", name)),
            Method::PUT => ("update".into(), format!("修改应用「{}」", name)),
            Method::DELETE => ("delete".into(), format!("删除应用 {}", sid)),
            _ => ("view".into(), "查看应用列表".into()),
        };
    }

    // ── 卡密管理 ──
    if path.contains("/cards/batch") {
        return match *method {
            Method::POST => {
                let c = count.map(|n| n.to_string()).unwrap_or_else(|| "?".into());
                if prefix.is_empty() {
                    ("create".into(), format!("批量生成 {} 张卡密", c))
                } else {
                    ("create".into(), format!("批量生成 {} 张卡密（前缀 {}）", c, prefix))
                }
            }
            Method::DELETE => ("delete".into(), "批量删除卡密".into()),
            _ => ("view".into(), "查看卡密列表".into()),
        };
    }
    if path.contains("/cards") {
        return match *method {
            Method::POST => {
                let ck = bf(body, "key");
                if ck.is_empty() { ("create".into(), "创建卡密".into()) }
                else { ("create".into(), format!("创建卡密 {}", ck)) }
            }
            Method::PUT => ("update".into(), format!("修改卡密 {}", sid)),
            Method::DELETE => ("delete".into(), format!("删除卡密 {}", sid)),
            _ => ("view".into(), "查看卡密列表".into()),
        };
    }

    // ── API管理 ──
    if path.contains("/keys") {
        return match *method {
            Method::POST => ("create".into(), format!("为应用 {} 生成 API Key", app_id)),
            Method::PUT => ("update".into(), format!("修改 API Key {}", sid)),
            Method::DELETE => ("delete".into(), format!("删除 API Key {}", sid)),
            _ => ("view".into(), "查看 API Key 列表".into()),
        };
    }

    // ── 商户风控 ──
    if path.contains("/blacklist") && !path.contains("/admin/") {
        return match *method {
            Method::POST => ("add".into(), format!("添加{}「{}」到黑名单", tp_label(&tp), value)),
            Method::DELETE => ("remove".into(), format!("从黑名单移除 {}", sid)),
            _ => ("view".into(), "查看黑名单列表".into()),
        };
    }
    if path.contains("/whitelist") && !path.contains("/admin/") {
        return match *method {
            Method::POST => ("add".into(), format!("添加{}「{}」到白名单", tp_label(&tp), value)),
            Method::DELETE => ("remove".into(), format!("从白名单移除 {}", sid)),
            _ => ("view".into(), "查看白名单列表".into()),
        };
    }

    // ── 消息/激活记录 ──
    if path.contains("/messages") && !path.contains("/admin/") {
        return match *method {
            Method::PUT => ("update".into(), "修改消息状态".into()),
            _ => ("view".into(), "查看消息列表".into()),
        };
    }
    if path.contains("/activations") { return ("view".into(), "查看激活记录".into()); }

    // ── 接口调用 ──
    if path.contains("/v1/activate") { return ("activate".into(), format!("激活卡密 {}", card_key)); }
    if path.contains("/v1/verify") { return ("verify".into(), format!("验证卡密 {}", card_key)); }
    if path.contains("/v1/unbind") { return ("unbind".into(), format!("解绑卡密 {} 的设备", card_key)); }
    if path.contains("/v1/heartbeat") { return ("heartbeat".into(), "设备心跳".into()); }
    if path.contains("/ts/sign") { return ("sign".into(), "参数签名".into()); }
    if path.contains("/ts/encrypt") { return ("encrypt".into(), "数据加密".into()); }
    if path.contains("/ts/decrypt") { return ("decrypt".into(), "数据解密".into()); }

    // ── 兜底 ──
    let verb = match *method {
        Method::GET => "查看",
        Method::POST => "操作",
        Method::PUT | Method::PATCH => "修改",
        Method::DELETE => "删除",
        _ => "操作",
    };
    ("other".into(), format!("{} {}", verb, path))
}

fn tp_label(tp: &str) -> &str {
    match tp { "card" => "卡密", "device" => "设备", _ => "IP" }
}

// ── 分类模块 ──

fn classify_module(path: &str) -> String {
    let m = if path.contains("/auth") { "认证" }
    else if path.contains("/admin/merchants") { "商户管理" }
    else if path.contains("/admin/blacklist") { "黑名单管理" }
    else if path.contains("/admin/whitelist") { "白名单管理" }
    else if path.contains("/admin/messages") { "消息管理" }
    else if path.contains("/admin/plan") { "套餐配置" }
    else if path.contains("/admin/alerts") { "异常告警" }
    else if path.contains("/admin/risk") { "风控设置" }
    else if path.contains("/admin/op-logs") { "操作日志" }
    else if path.contains("/admin") { "管理员" }
    else if path.contains("/merchant/change-password") { "修改密码" }
    else if path.contains("/merchant/regenerate") { "API管理" }
    else if path.contains("/merchant/profile") { "账号设置" }
    else if path.contains("/merchant/op-logs") { "操作日志" }
    else if path.contains("/merchant") { "商户" }
    else if path.contains("/apps") { "应用管理" }
    else if path.contains("/cards") { "卡密管理" }
    else if path.contains("/keys") { "API管理" }
    else if path.contains("/blacklist") { "风控管理" }
    else if path.contains("/whitelist") { "风控管理" }
    else if path.contains("/messages") { "消息中心" }
    else if path.contains("/activations") { "激活记录" }
    else if path.contains("/v1/activate") { "接口-激活" }
    else if path.contains("/v1/verify") { "接口-验证" }
    else if path.contains("/v1/unbind") { "接口-解绑" }
    else if path.contains("/v1/heartbeat") { "接口-心跳" }
    else if path.contains("/ts/sign") { "接口-签名" }
    else if path.contains("/ts/encrypt") { "接口-加密" }
    else if path.contains("/ts/decrypt") { "接口-解密" }
    else if path.contains("/frontend-log") { "前端操作" }
    else { "其他" }
};
    m.to_string()
}