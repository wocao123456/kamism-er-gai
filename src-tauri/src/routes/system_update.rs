use crate::middleware::auth::{auth_middleware, AppState};
use crate::utils::jwt::Claims;
use axum::{
    extract::State,
    http::StatusCode,
    middleware,
    response::{IntoResponse, Response},
    routing::{get, post},
    Extension, Json, Router,
};
use serde_json::json;
use std::{env, fs, process::Command};

pub fn system_update_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/system-update/status", get(update_status))
        .route("/system-update/apply", post(apply_update))
        .route_layer(middleware::from_fn_with_state(state.clone(), auth_middleware))
        .with_state(state)
}

fn workdir() -> String {
    env::var("UPDATE_WORKDIR").unwrap_or_else(|_| "/workspace".to_string())
}

fn hostdir() -> String {
    env::var("HOST_PROJECT_DIR").unwrap_or_else(|_| "/root/kamism".to_string())
}

fn log_path() -> String {
    format!("{}/.auto_update_cron.log", workdir())
}

fn sh(cmd: &str) -> Result<String, String> {
    let out = Command::new("sh")
        .arg("-lc")
        .arg(cmd)
        .current_dir(workdir())
        .output()
        .map_err(|e| e.to_string())?;

    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

fn first_heading(md: &str) -> String {
    md.lines()
        .find(|l| l.starts_with("## ["))
        .unwrap_or("## [未知版本]")
        .trim()
        .to_string()
}

fn first_section(md: &str) -> String {
    let mut out = Vec::new();
    let mut in_section = false;
    for line in md.lines() {
        if line.starts_with("## [") {
            if in_section {
                break;
            }
            in_section = true;
        }
        if in_section {
            out.push(line);
        }
    }
    out.join("\n").trim().to_string()
}

fn tail_log() -> String {
    fs::read_to_string(log_path())
        .unwrap_or_default()
        .lines()
        .rev()
        .take(300)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n")
}

fn admin_only(claims: &Claims) -> Option<Response> {
    if claims.role != "admin" {
        Some((
            StatusCode::FORBIDDEN,
            Json(json!({"success": false, "message": "需要管理员权限"})),
        )
            .into_response())
    } else {
        None
    }
}

async fn update_status(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Response {
    if let Some(r) = admin_only(&claims) {
        return r;
    }

    let _ = sh("git fetch origin main");

    let latest = sh("git rev-parse --short origin/main").unwrap_or_else(|_| "unknown".into());
    let latest_msg = sh("git log -1 --pretty=%s origin/main").unwrap_or_default();

    let local_changelog =
        fs::read_to_string(format!("{}/CHANGELOG.md", workdir())).unwrap_or_default();
    let remote_changelog =
        sh("git show origin/main:CHANGELOG.md").unwrap_or_else(|_| local_changelog.clone());

    let installed: Option<(String, String, String)> = sqlx::query_as(
        "SELECT version_text, commit_hash, commit_message FROM system_versions WHERE id = 1",
    )
    .fetch_optional(&state.pool)
    .await
    .ok()
    .flatten();

    let fallback_current_hash = sh("git rev-parse --short HEAD").unwrap_or_else(|_| "unknown".into());
    let fallback_current_msg = sh("git log -1 --pretty=%s HEAD").unwrap_or_default();
    let fallback_current_ver = first_heading(&local_changelog);

    let (current_version, current_hash, current_msg) = if let Some((v, h, m)) = installed {
        (v, h, m)
    } else {
        (fallback_current_ver, fallback_current_hash, fallback_current_msg)
    };

    let has_update = current_hash != latest;
    let running = fs::read_to_string(format!("{}/.auto_update_running", workdir()))
        .ok()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    let display_changelog = if has_update {
        first_section(&remote_changelog)
    } else {
        remote_changelog.clone()
    };

    Json(json!({"success": true, "data": {
        "current": current_hash,
        "latest": latest,
        "current_message": current_msg,
        "latest_message": latest_msg,
        "current_version": current_version,
        "latest_version": first_heading(&remote_changelog),
        "has_update": has_update,
        "running": running,
        "changelog": display_changelog,
        "log": tail_log()
    }})).into_response()
}

async fn apply_update(Extension(claims): Extension<Claims>) -> Response {
    if let Some(r) = admin_only(&claims) {
        return r;
    }

    let cmd = format!(
        "docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v {0}:{0} -w {0} -e DATABASE_URL=\"$DATABASE_URL\" docker:27-cli sh -lc 'apk add --no-cache git bash postgresql-client >/dev/null && : > {0}/.auto_update_cron.log && bash {0}/auto_update.sh' >/tmp/kamism_update_trigger.log 2>&1 &",
        hostdir()
    );

    match Command::new("sh").arg("-lc").arg(&cmd).spawn() {
        Ok(_) => Json(json!({
            "success": true,
            "message": "系统更新已开始"
        }))
        .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "success": false,
                "message": format!("启动更新失败: {}", e)
            })),
        )
            .into_response(),
    }
}
