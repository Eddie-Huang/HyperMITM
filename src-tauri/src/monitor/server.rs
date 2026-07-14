//! Monitor Axum web server
//!
//! Lightweight HTTP server that serves:
//! - REST API at `/api/monitor/*` (usage + session data)
//! - Static SPA frontend at `/` (embedded via rust-embed)

use super::handlers::{get_daily_trends, get_model_stats, get_provider_stats, get_session_messages, get_status, get_usage_summary, get_usage_summary_by_app, list_sessions, MonitorState};
use crate::database::Database;
use axum::{
    extract::Request,
    http::{header, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::{get, Router},
};
use rust_embed::Embed;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::oneshot;

/// Embedded monitor frontend assets.
/// At build time, the `dist-monitor/` directory must contain the built React SPA.
/// If the directory is empty or missing, the monitor serves only the REST API
/// (no web dashboard).
#[derive(Embed)]
#[folder = "dist-monitor/"]
#[prefix = ""]
struct MonitorAssets;

/// Configuration for the monitor server.
#[derive(Debug, Clone)]
pub struct MonitorConfig {
    pub listen_addr: String,
    pub port: u16,
    #[allow(dead_code)]
    pub auth_token: Option<String>,
}

/// The monitor HTTP server.
pub struct MonitorServer {
    config: MonitorConfig,
    state: MonitorState,
    shutdown_tx: Arc<std::sync::Mutex<Option<oneshot::Sender<()>>>>,
}

impl MonitorServer {
    pub fn new(config: MonitorConfig, db: Arc<Database>) -> Self {
        Self {
            config,
            state: MonitorState { db },
            shutdown_tx: Arc::new(std::sync::Mutex::new(None)),
        }
    }

    /// Build the Axum router with API routes + static file serving.
    fn build_router(&self) -> Router {
        let api = Router::new()
            .route("/usage/summary", get(get_usage_summary))
            .route("/usage/by-app", get(get_usage_summary_by_app))
            .route("/usage/trends", get(get_daily_trends))
            .route("/usage/provider-stats", get(get_provider_stats))
            .route("/usage/model-stats", get(get_model_stats))
            .route("/sessions/list", get(list_sessions))
            .route("/sessions/messages", get(get_session_messages))
            .route("/status", get(get_status));

        Router::new()
            .nest("/api/monitor", api)
            .fallback(static_file_handler)
            .with_state(self.state.clone())
    }

    /// Start the monitor server. Blocks until shutdown signal received.
    pub async fn start(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let addr: SocketAddr = format!("{}:{}", self.config.listen_addr, self.config.port)
            .parse()
            .map_err(|e| format!("Invalid monitor address: {e}"))?;

        let (tx, rx) = oneshot::channel::<()>();
        {
            let mut guard = self.shutdown_tx.lock().unwrap();
            *guard = Some(tx);
        }

        let router = self.build_router();
        let listener = tokio::net::TcpListener::bind(addr).await?;

        log::info!("Monitor server listening on {addr}");

        axum::serve(listener, router)
            .with_graceful_shutdown(async {
                rx.await.ok();
            })
            .await?;

        log::info!("Monitor server shut down");
        Ok(())
    }

    /// Stop the monitor server.
    #[allow(dead_code)]
    pub fn stop(&self) {
        let mut guard = self.shutdown_tx.lock().unwrap();
        if let Some(tx) = guard.take() {
            tx.send(()).ok();
        }
    }
}

/// Serve embedded static files from `dist-monitor/`.
/// Falls back to `index.html` for SPA routing (unknown paths → index.html).
async fn static_file_handler(req: Request) -> Response {
    let path = req.uri().path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };

    match MonitorAssets::get(path) {
        Some(file) => {
            let mime = mime_from_path(path);
            (
                [(header::CONTENT_TYPE, mime.to_string())],
                file.data.into_owned(),
            )
                .into_response()
        }
        None => {
            // SPA fallback: serve index.html for unknown routes
            match MonitorAssets::get("index.html") {
                Some(file) => Html(String::from_utf8_lossy(&file.data).into_owned()).into_response(),
                None => StatusCode::NOT_FOUND.into_response(),
            }
        }
    }
}

fn mime_from_path(path: &str) -> String {
    match path.rsplit('.').next() {
        Some("html") => mime::TEXT_HTML.to_string(),
        Some("js") => mime::APPLICATION_JAVASCRIPT.to_string(),
        Some("mjs") => mime::APPLICATION_JAVASCRIPT.to_string(),
        Some("css") => mime::TEXT_CSS.to_string(),
        Some("json") => mime::APPLICATION_JSON.to_string(),
        Some("png") => mime::IMAGE_PNG.to_string(),
        Some("jpg") | Some("jpeg") => mime::IMAGE_JPEG.to_string(),
        Some("svg") => mime::IMAGE_SVG.to_string(),
        Some("woff") => mime::FONT_WOFF.to_string(),
        Some("woff2") => "font/woff2".parse().unwrap_or(mime::APPLICATION_OCTET_STREAM.to_string()),
        Some("ico") => "image/x-icon".to_string(),
        _ => mime::APPLICATION_OCTET_STREAM.to_string(),
    }
}