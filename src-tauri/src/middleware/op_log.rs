use axum::{
    body::Bytes,
    extract::{Request, State},
    http::Method,
    middleware::Next,
    response::Response,
};
use serde_json::Value as JsonValue;
use crate::middleware::auth::AppState;
use crate::utils::jwt::{verify_token, Claims};
use crate::utils::op_log::log_operation;
use uuid::Uuid;

pub async fn op_log_middleware(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let is_write = method == Method::POST || method == Method::PUT || method == Method::PATCH || method == Method::DELETE;

    // 先读取请求体，再放回去，确保 handler 能正常消费
    let (body_json, body_bytes): (Option<JsonValue>, Bytes) = if is_write {
        match req.body_mut().collect().await {
            Ok(collected) => {
                let bytes: Bytes = collected.into();
                let json: Option<JsonValue> = serde_json::from_slice(&bytes).ok();
                // 把 body 重新注入到请求中
                *req.body_mut() = axum::body::boxed(axum::body::Full::new(bytes.clone()));
                (json, bytes)
            }
            Err(_) => (None, Bytes::new()),
        }
    } else {
        (None, Bytes::new())
    };

    let claims = req
        .headers()
        .get("authorization")
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
            println!("[OP_LOG] action={} module={} detail={}", action, module, detail);
            log_operation(&pool, user_type, user_id, &action, &module, &detail, "").await;
        });
    }
    response
}

// 从请求体中提取字段值
fn body_field(body: Option<&JsonValue>, key: &str) -> String {
    body.and_then(|b| b.get(key))
        .and_then(|v| v.as_str().or_else(|| v.as_i64().map(|_| "")))
        .map(|s| s.to_string())
        .unwrap_or_default()
}

fn body_int(body: Option<&JsonValue>, key: &str) -> Option<i64> {
    body.and_then(|b| b.get(key))
        .and_then(|v| v.as_i64())
}

// 从路径中提取 UUID
fn extract_id_from_path(path: &str) -> Option<String> {
    // /admin/merchants/{uuid} -> Some(uuid)
    let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
    parts.last()
        .filter(|s| s.len() > 20 && s.contains('-'))
        .map(|s| s.to_string())
}

fn classify_action(method: &Method, path: &str, body: Option<&JsonValue>) -> (String, String) {
    let id = extract_id_from_path(path);
    let name = body_field(body, "name");
    let email = body_field(body, "email");
    let value = body_field(body, "value");
    let reason = body_field(body, "reason");
    let tp = body_field(body, "tp");
    let count = body_int(body, "count");
    let app_name = body_field(body, "app_name").or_else(|| body_field(body, "name"));
    let key = body_field(body, "key");
    let secret = body_field(body, "secret");
    let plan = body_field(body, "plan");
    let status = body_field(body, "status");
    let title = body_field(body, "title");
    let content = body_field(body, "content");
    let new_password = body_field(body, "new_password");
    let detail_id = id.clone().unwrap_or_default();
    let short_id = if detail_id.len() > 8 { &detail_id[..8] } else { &detail_id };

    // ── 认证 ──
    if path.contains("/auth/login") {
        let who = body_field(body, "email");
        let who_display = if who.is_empty() { "".into() } else { format!(" ({})", who) };
        return ("login".into(), format!("登录系统{}", who_display));
    }
    if path.contains("/auth/register") {
        let who = body_field(body, "email");
        return ("register".into(), format!("注册新账号 ({})", who));
    }
    if path.contains("/auth/logout") { return ("logout".into(), "退出登录".into()); }
    if path.contains("/auth/reset-password") { return ("reset_password".into(), "重置密码".into()); }

    // ── 前端上报 ──
    if path.contains("/frontend-log") {
        let action_val = body_field(body, "action");
        let module_val = body_field(body, "module");
        let detail_val = body_field(body, "detail");
        return (action_val, format!("{}", if detail_val.is_empty() { module_val } else { detail_val }));
    }

    // ── 管理员 - 商户管理 ──
    if path.contains("/admin/merchants") && path.contains("/plan") {
        return ("update_plan".into(), format!("修改商户套餐为 {}", plan));
    }
    if path.contains("/admin/merchants") && path.contains("/status") {
        return ("update_status".into(), format!("修改商户状态为 {}", status));
    }
    if path.contains("/admin/merchants") {
        match *method {
            Method::POST => {
                let who = body_field(body, "email");
                if who.is_empty() {
                    return ("create".into(), "新建商户".into());
                }
                return ("create".into(), format!("新建商户 {}", who));
            }
            Method::PUT => return ("update".into(), format!("修改商户 {}", if name.is_empty() { short_id } else { &name })),
            Method::DELETE => return ("delete".into(), format!("删除商户 {}", short_id)),
            Method::GET => return ("view".into(), "查看商户列表".into()),
            _ => {}
        }
    }

    // ── 管理员 - 黑白名单 ──
    if path.contains("/admin/blacklist") {
        let tp_label = match tp.as_str() { "card" => "卡密", "device" => "设备", _ => "IP" };
        match *method {
            Method::POST => return ("add".into(), format!("添加{}到黑名单", if value.is_empty() { "条目" } else { &value })),
            Method::DELETE => return ("remove".into(), format!("从黑名单移除 {}", short_id)),
            Method::GET => return ("view".into(), "查看黑名单列表".into()),
            _ => {}
        }
    }
    if path.contains("/admin/whitelist") {
        match *method {
            Method::POST => return ("add".into(), format!("添加{}到白名单", if value.is_empty() { "条目" } else { &value })),
            Method::DELETE => return ("remove".into(), format!("从白名单移除 {}", short_id)),
            Method::GET => return ("view".into(), "查看白名单列表".into()),
            _ => {}
        }
    }

    // ── 管理员 - 告警 ──
    if path.contains("/admin/alerts") {
        match *method {
            Method::POST | Method::PATCH => return ("update".into(), format!("标记告警 {} 为已读", short_id)),
            Method::GET => return ("view".into(), "查看异常告警列表".into()),
            _ => {}
        }
    }

    // ── 管理员 - 套餐配置 ──
    if path.contains("/admin/plan") {
        match *method {
            Method::POST => return ("update".into(), "修改套餐配置".into()),
            Method::GET => return ("view".into(), "查看套餐配置".into()),
            _ => {}
        }
    }

    // ── 管理员 - 风控设置 ──
    if path.contains("/admin/risk") {
        match *method {
            Method::POST => {
                let key_val = body_field(body, "key");
                return ("update".into(), format!("修改风控设置 {}", key_val));
            }
            Method::GET => return ("view".into(), "查看风控设置".into()),
            _ => {}
        }
    }

    // ── 管理员 - 消息管理 ──
    if path.contains("/admin/messages") {
        match *method {
            Method::POST => return ("send".into(), format!("发送消息「{}」", title)),
            Method::PUT => return ("update".into(), format!("修改消息「{}」", title)),
            Method::DELETE => return ("delete".into(), format!("删除消息 {}", short_id)),
            Method::GET => return ("view".into(), "查看消息列表".into()),
            _ => {}
        }
    }

    // ── 管理员 - 操作日志 ──
    if path.contains("/admin/op-logs") {
        return ("view".into(), "查看全局操作日志".into());
    }

    // ── 管理员 - 统计 ──
    if path.contains("/admin/stats") {
        return ("view".into(), "查看平台统计数据".into());
    }

    // ── 商户 - 密码 ──
    if path.contains("/merchant/change-password") { return ("change_password".into(), "修改登录密码".into()); }

    // ── 商户 - API Key ──
    if path.contains("/merchant/regenerate") { return ("regenerate".into(), "重新生成 API Key".into()); }

    // ── 商户 - 个人信息 ──
    if path.contains("/merchant/profile") {
        match *method {
            Method::PUT => return ("update".into(), format!("修改账号信息")),
            Method::GET => return ("view".into(), "查看账号信息".into()),
            _ => {}
        }
    }
    if path.contains("/merchant/op-logs") { return ("view".into(), "查看操作日志".into()); }
    if path.contains("/merchant/dashboard-stats") { return ("view".into(), "查看商户统计数据".into()); }

    // ── 应用管理 ──
    if path.contains("/apps") {
        match *method {
            Method::POST => return ("create".into(), format!("新建应用「{}」", app_name)),
            Method::PUT => return ("update".into(), format!("修改应用「{}」", app_name)),
            Method::DELETE => return ("delete".into(), format!("删除应用 {}", short_id)),
            Method::GET => return ("view".into(), "查看应用列表".into()),
            _ => {}
        }
    }

    // ── 卡密管理 ──
    if path.contains("/cards/batch") {
        let count_str = count.map(|c| c.to_string()).unwrap_or_default();
        match *method {
            Method::POST => {
                let prefix = body_field(body, "prefix");
                let app_id = body_field(body, "app_id");
                if prefix.is_empty() {
                    return ("create".into(), format!("批量生成 {} 张卡密", count_str));
                }
                return ("create".into(), format!("批量生成 {} 张卡密（前缀 {}）", count_str, prefix));
            }
            Method::DELETE => return ("delete".into(), format!("批量删除卡密")),
            _ => {}
        }
    }
    if path.contains("/cards") {
        match *method {
            Method::POST => {
                let card_key = body_field(body, "key");
                let app_id = body_field(body, "app_id");
                if card_key.is_empty() {
                    return ("create".into(), "创建卡密".into());
                }
                return ("create".into(), format!("创建卡密 {}", card_key));
            }
            Method::PUT => {
                let card_key = body_field(body, "key");
                if card_key.is_empty() {
                    return ("update".into(), format!("修改卡密 {}", short_id));
                }
                return ("update".into(), format!("修改卡密 {}", card_key));
            }
            Method::DELETE => return ("delete".into(), format!("删除卡密 {}", short_id)),
            Method::GET => return ("view".into(), "查看卡密列表".into()),
            _ => {}
        }
    }

    // ── API管理 ──
    if path.contains("/keys") {
        match *method {
            Method::POST => {
                let app_id = body_field(body, "app_id");
                return ("create".into(), format!("为应用 {} 生成 API Key", app_id));
            }
            Method::PUT => return ("update".into(), format!("修改 API Key {}", short_id)),
            Method::DELETE => return ("delete".into(), format!("删除 API Key {}", short_id)),
            Method::GET => return ("view".into(), "查看 API Key 列表".into()),
            _ => {}
        }
    }

    // ── 风控管理（商户） ──
    if path.contains("/blacklist") && !path.contains("/admin/") {
        let tp_label = match tp.as_str() { "card" => "卡密", "device" => "设备", _ => "IP" };
        match *method {
            Method::POST => return ("add".into(), format!("添加 {} {} 到黑名单", tp_label, value)),
            Method::DELETE => return ("remove".into(), format!("从黑名单移除 {}", short_id)),
            Method::GET => return ("view".into(), "查看黑名单列表".into()),
            _ => {}
        }
    }
    if path.contains("/whitelist") && !path.contains("/admin/") {
        match *method {
            Method::POST => return ("add".into(), format!("添加 {} {} 到白名单", tp_label, value)),
            Method::DELETE => return ("remove".into(), format!("从白名单移除 {}", short_id)),
            Method::GET => return ("view".into(), "查看白名单列表".into()),
            _ => {}
        }
    }

    // ── 消息中心（商户） ──
    if path.contains("/messages") && !path.contains("/admin/") {
        match *method {
            Method::GET => return ("view".into(), "查看消息列表".into()),
            Method::PUT => return ("update".into(), "修改消息状态".into()),
            _ => {}
        }
    }

    // ── 激活记录 ──
    if path.contains("/activations") {
        return ("view".into(), "查看激活记录".into());
    }

    // ── 接口调用 ──
    if path.contains("/v1/activate") {
        let card = body_field(body, "card_key");
        if card.is_empty() { return ("activate".into(), "接口激活卡密".into()); }
        return ("activate".into(), format!("接口激活卡密 {}", card));
    }
    if path.contains("/v1/verify") {
        let card = body_field(body, "card_key");
        if card.is_empty() { return ("verify".into(), "接口验证卡密".into()); }
        return ("verify".into(), format!("接口验证卡密 {}", card));
    }
    if path.contains("/v1/unbind") {
        let card = body_field(body, "card_key");
        if card.is_empty() { return ("unbind".into(), "接口解绑设备".into()); }
        return ("unbind".into(), format!("接口解绑卡密 {} 的设备", card));
    }
    if path.contains("/v1/heartbeat") { return ("heartbeat".into(), "接口心跳".into()); }
    if path.contains("/ts/sign") { return ("sign".into(), "接口签名".into()); }
    if path.contains("/ts/encrypt") { return ("encrypt".into(), "接口加密".into()); }
    if path.contains("/ts/decrypt") { return ("decrypt".into(), "接口解密".into()); }

    // ── 兜底 ──
    let label = match *method {
        Method::GET => format!("查看 {}", path),
        Method::POST => format!("操作 {}", path),
        Method::PUT | Method::PATCH => format!("修改 {}", path),
        Method::DELETE => format!("删除 {}", path),
        _ => path.to_string(),
    };
    ("other".into(), label)
}

fn classify_module(path: &str) -> String {
    if path.contains("/auth") { "认证".into() }
    else if path.contains("/admin/merchants") { "商户管理".into() }
    else if path.contains("/admin/blacklist") { "黑名单管理".into() }
    else if path.contains("/admin/whitelist") { "白名单管理".into() }
    else if path.contains("/admin/messages") { "消息管理".into() }
    else if path.contains("/admin/plan") { "套餐配置".into() }
    else if path.contains("/admin/alerts") { "异常告警".into() }
    else if path.contains("/admin/risk") { "风控设置".into() }
    else if path.contains("/admin/op-logs") { "操作日志".into() }
    else if path.contains("/admin") { "管理员".into() }
    else if path.contains("/merchant/change-password") { "修改密码".into() }
    else if path.contains("/merchant/regenerate") { "API管理".into() }
    else if path.contains("/merchant/profile") { "账号设置".into() }
    else if path.contains("/merchant/op-logs") { "操作日志".into() }
    else if path.contains("/merchant") { "商户".into() }
    else if path.contains("/apps") { "应用管理".into() }
    else if path.contains("/cards/batch") { "卡密管理".into() }
    else if path.contains("/cards") { "卡密管理".into() }
    else if path.contains("/keys") { "API管理".into() }
    else if path.contains("/blacklist") { "风控管理".into() }
    else if path.contains("/whitelist") { "风控管理".into() }
    else if path.contains("/messages") { "消息中心".into() }
    else if path.contains("/activations") { "激活记录".into() }
    else if path.contains("/v1/activate") { "接口-激活".into() }
    else if path.contains("/v1/verify") { "接口-验证".into() }
    else if path.contains("/v1/unbind") { "接口-解绑".into() }
    else if path.contains("/v1/heartbeat") { "接口-心跳".into() }
    else if path.contains("/ts/sign") { "接口-签名".into() }
    else if path.contains("/ts/encrypt") { "接口-加密".into() }
    else if path.contains("/ts/decrypt") { "接口-解密".into() }
    else if path.contains("/frontend-log") { "前端操作".into() }
    else { "其他".into() }
}