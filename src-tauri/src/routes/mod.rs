// src-tauri/src/routes/mod.rs
pub mod auth;
pub mod admin;
pub mod merchant;
pub mod apps;
pub mod cards;
pub mod activations;
pub mod public_api;
pub mod plan_config;
pub mod messages;
pub mod webhooks;
pub mod health;
pub mod blacklist;
pub mod agent;
pub mod api_keys;
pub mod api_ts;

use axum::Router;
use crate::middleware::auth::AppState;

pub fn routes(state: AppState) -> Router<AppState> {
    let health = health::health_router();
    Router::new()
        .nest("/auth", auth::auth_router(state.clone()))
        .nest("/admin", admin::admin_router_with_state(state.clone()))
        .nest("/merchant", merchant::merchant_router(state.clone()))
        .nest("/apps", apps::apps_router(state.clone()))
        .nest("/cards", cards::cards_router(state.clone()))
        .nest("/activations", activations::activations_router(state.clone()))
        .nest("/v1", public_api::public_api_router(state.clone()))
        .nest("/plan-configs", plan_config::plan_config_router(state.clone()))
        .nest("/messages", messages::messages_admin_router(state.clone()))
        .nest("/webhooks", webhooks::webhooks_router(state.clone()))
        .nest("/health", health.clone())
        .nest("/api/health", health)
        .nest("/blacklist", blacklist::blacklist_router(state.clone()))
        .nest("/agent", agent::agent_router(state.clone()))
        .nest("/", api_keys::api_keys_router(state.clone()))
}