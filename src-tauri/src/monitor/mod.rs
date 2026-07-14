//! Web Monitor module
//!
//! Standalone Axum HTTP server that provides a browser-accessible
//! monitoring dashboard for usage stats and session management (read-only).

pub mod handlers;
pub mod server;

pub use server::MonitorServer;
pub use server::MonitorConfig;