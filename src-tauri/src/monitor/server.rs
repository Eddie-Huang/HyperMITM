//! Monitor daemon — lightweight axum HTTP server for usage and session monitoring.
//! Runs on a separate port (default: proxy_port + 1), serves REST API for the web UI.

use axum::{
    extract::{Path, State},
    http::Method,
    routing::get,
    Json, Router,
};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

use crate::session_manager;
use crate::store::AppState;

/// Start the monitor HTTP server on the given port.
/// Binds to 127.0.0.1 only. Falls back to port+1 if the primary port is taken.
pub async fn start_monitor_server(state: AppState, port: u16) {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::OPTIONS])
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/health", get(health_check))
        .route("/api/usage/summary", get(usage_summary))
        .route("/api/sessions", get(list_sessions))
        .route("/api/sessions/{provider}/{*path}", get(session_messages))
        .route("/api/proxy/status", get(proxy_status))
        .layer(cors)
        .with_state(Arc::new(state));

    let addr = format!("127.0.0.1:{}", port);
    log::info!("[monitor] binding to {addr}");

    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            log::error!("[monitor] failed to bind port {port}: {e}, trying {}+1", port);
            let fallback_port = port + 1;
            let fallback_addr = format!("127.0.0.1:{}", fallback_port);
            match tokio::net::TcpListener::bind(&fallback_addr).await {
                Ok(l) => l,
                Err(e2) => {
                    log::error!("[monitor] fallback port also failed: {e2}");
                    return;
                }
            }
        }
    };

    if let Err(e) = axum::serve(listener, app).await {
        log::error!("[monitor] server exited: {e}");
    }
}

// ── Routes ────────────────────────────────────────────────────────────────

async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

/// 30-day usage summary.
async fn usage_summary(
    State(state): State<Arc<AppState>>,
) -> Json<serde_json::Value> {
    let db = &state.db;
    let end_ts = chrono::Utc::now().timestamp_millis();
    let start_ts = (chrono::Utc::now() - chrono::Duration::days(30)).timestamp_millis();

    let summary = db.get_usage_summary(Some(start_ts), Some(end_ts), None, None, None);
    match summary {
        Ok(s) => Json(serde_json::json!({
            "total_input_tokens": s.total_input_tokens,
            "total_output_tokens": s.total_output_tokens,
            "total_cost_usd": s.total_cost,
            "request_count": s.total_requests,
            "success_rate": s.success_rate,
            "cache_hit_rate": s.cache_hit_rate,
            "real_total_tokens": s.real_total_tokens,
        })),
        Err(e) => Json(serde_json::json!({
            "error": format!("query failed: {e}"),
        })),
    }
}

/// List all sessions from disk.
async fn list_sessions(
    State(_state): State<Arc<AppState>>,
) -> Json<serde_json::Value> {
    let sessions: Vec<serde_json::Value> = session_manager::scan_sessions()
        .into_iter()
        .map(|s| serde_json::to_value(s).unwrap_or_default())
        .collect();
    Json(serde_json::json!(sessions))
}

/// Get messages for a specific session by provider + source path.
async fn session_messages(
    State(_state): State<Arc<AppState>>,
    Path((provider, path)): Path<(String, String)>,
) -> Json<serde_json::Value> {
    let messages = session_manager::load_messages(&provider, &path);
    match messages {
        Ok(msgs) => Json(serde_json::json!(msgs)),
        Err(e) => Json(serde_json::json!({ "error": e })),
    }
}

/// Current proxy server status (running state, port).
async fn proxy_status(
    State(state): State<Arc<AppState>>,
) -> Json<serde_json::Value> {
    let running = state.proxy_service.is_running().await;
    let (addr, port) = if running {
        match state.proxy_service.get_status().await {
            Ok(status) => (Some(status.address), Some(status.port)),
            Err(_) => (None, None),
        }
    } else {
        (None::<String>, None::<u16>)
    };
    Json(serde_json::json!({
        "running": running,
        "address": addr,
        "port": port,
    }))
}
