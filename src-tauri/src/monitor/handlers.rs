//! Monitor REST API handlers
//!
//! Exposes usage and session data via HTTP JSON endpoints.
//! These handlers call Database methods directly, bypassing Tauri invoke.

use crate::database::Database;
use crate::session_manager;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Shared state for monitor handlers
#[derive(Clone)]
pub struct MonitorState {
    pub db: Arc<Database>,
}

// ─── Query params ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummaryParams {
    pub start_date: Option<i64>,
    pub end_date: Option<i64>,
    pub app_type: Option<String>,
    pub provider_name: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageTrendsParams {
    pub start_date: Option<i64>,
    pub end_date: Option<i64>,
    pub app_type: Option<String>,
    pub provider_name: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestLogsParams {
    pub start_date: Option<i64>,
    pub end_date: Option<i64>,
    pub app_type: Option<String>,
    pub provider_name: Option<String>,
    pub model: Option<String>,
    pub page: Option<u32>,
    pub page_size: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct SessionMessagesParams {
    pub provider_id: String,
    pub source_path: String,
}

// ─── Status response ─────────────────────────────────────────────

#[derive(Serialize)]
pub struct MonitorStatusResponse {
    pub status: String,
    pub version: String,
}

// ─── Handlers ────────────────────────────────────────────────────

pub async fn get_usage_summary(
    State(state): State<MonitorState>,
    Query(params): Query<UsageSummaryParams>,
) -> impl IntoResponse {
    let result = state.db.get_usage_summary(
        params.start_date,
        params.end_date,
        params.app_type.as_deref(),
        params.provider_name.as_deref(),
        params.model.as_deref(),
    );
    match result {
        Ok(summary) => (StatusCode::OK, Json(summary)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_usage_summary_by_app(
    State(state): State<MonitorState>,
    Query(params): Query<UsageSummaryParams>,
) -> impl IntoResponse {
    let result = state.db.get_usage_summary_by_app(
        params.start_date,
        params.end_date,
        params.provider_name.as_deref(),
        params.model.as_deref(),
    );
    match result {
        Ok(summary) => (StatusCode::OK, Json(summary)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_daily_trends(
    State(state): State<MonitorState>,
    Query(params): Query<UsageTrendsParams>,
) -> impl IntoResponse {
    let result = state.db.get_daily_trends(
        params.start_date,
        params.end_date,
        params.app_type.as_deref(),
        params.provider_name.as_deref(),
        params.model.as_deref(),
    );
    match result {
        Ok(trends) => (StatusCode::OK, Json(trends)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_provider_stats(
    State(state): State<MonitorState>,
    Query(params): Query<UsageSummaryParams>,
) -> impl IntoResponse {
    let result = state.db.get_provider_stats(
        params.start_date,
        params.end_date,
        params.app_type.as_deref(),
        params.provider_name.as_deref(),
        params.model.as_deref(),
    );
    match result {
        Ok(stats) => (StatusCode::OK, Json(stats)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_model_stats(
    State(state): State<MonitorState>,
    Query(params): Query<UsageSummaryParams>,
) -> impl IntoResponse {
    let result = state.db.get_model_stats(
        params.start_date,
        params.end_date,
        params.app_type.as_deref(),
        params.provider_name.as_deref(),
        params.model.as_deref(),
    );
    match result {
        Ok(stats) => (StatusCode::OK, Json(stats)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn list_sessions(
    State(_state): State<MonitorState>,
) -> impl IntoResponse {
    let sessions = tauri::async_runtime::spawn_blocking(session_manager::scan_sessions)
        .await
        .ok();
    match sessions {
        Some(sessions) => (StatusCode::OK, Json(sessions)).into_response(),
        None => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "Failed to scan sessions" })),
        )
            .into_response(),
    }
}

pub async fn get_session_messages(
    State(_state): State<MonitorState>,
    Query(params): Query<SessionMessagesParams>,
) -> impl IntoResponse {
    let provider_id = params.provider_id.clone();
    let source_path = params.source_path.clone();
    let messages = tauri::async_runtime::spawn_blocking(move || {
        session_manager::load_messages(&provider_id, &source_path)
    })
    .await
    .ok();
    match messages {
        Some(Ok(messages)) => (StatusCode::OK, Json(messages)).into_response(),
        Some(Err(e)) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e })),
        )
            .into_response(),
        None => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "Failed to load messages" })),
        )
            .into_response(),
    }
}

pub async fn get_status() -> impl IntoResponse {
    Json(MonitorStatusResponse {
        status: "running".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}