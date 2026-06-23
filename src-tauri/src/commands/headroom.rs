//! Headroom 集成相关命令
//!
//! 提供 headroom（上下文压缩反向代理）的配置读写与进程启停。
//!
//! 请求链路：Claude Code → headroom(:port) → 本地代理(:listen_port) → 供应商
//!
//! 本地代理生命周期策略：
//! - 开启 headroom 时**强制**开启 Claude 本地代理接管；若代理此前已由用户开启，
//!   则仅把 headroom 的上游指向用户设置的地址/端口（不改变其归属）。
//! - 关闭 headroom 时，仅当本地代理是由 headroom 自动开启的才一并关闭；若是用户
//!   手动开启的则保持运行，并把客户端地址从（已停止的）headroom 切回本地代理。

use crate::proxy::types::HeadroomConfig;
use crate::services::{HeadroomManager, HeadroomStatus};
use crate::store::AppState;

/// 读取 headroom 配置（不存在则返回默认值）
#[tauri::command]
pub fn get_headroom_config(state: tauri::State<'_, AppState>) -> Result<HeadroomConfig, String> {
    state.db.get_headroom_config().map_err(|e| e.to_string())
}

/// 开启 headroom：强制开启本地代理接管，并启动 headroom 指回本地代理。
async fn enable_headroom(
    state: &tauri::State<'_, AppState>,
    config: &HeadroomConfig,
) -> Result<HeadroomStatus, String> {
    // 1. 本地代理（Claude 接管）此前是否已开启 —— 决定归属（provenance）
    let was_active = state
        .proxy_service
        .get_takeover_status()
        .await
        .map(|s| s.claude)
        .unwrap_or(false);

    // 2. 计算上游：本地代理 origin（使用用户设置的监听地址/端口，即使代理未运行也可解析）
    let upstream = state
        .proxy_service
        .local_proxy_origin()
        .await
        .map_err(|e| format!("无法获取本地代理地址：{e}"))?;

    // 3. 记录归属：仅当此前未开启时，才视为本地代理由 headroom 自动开启
    HeadroomManager::set_auto_started_proxy(!was_active);

    // 4. 先启动 headroom（上游指回本地代理），再开启接管，避免接管路径重复重启进程
    let status = HeadroomManager::start(config, &upstream)?;

    // 5. 强制开启 Claude 本地代理接管：启动本地代理服务器并把客户端地址写到 headroom
    if let Err(e) = state.proxy_service.set_takeover_for_app("claude", true).await {
        // 回滚：本次开启失败 → 停掉 headroom 并清除归属标志
        let _ = HeadroomManager::stop();
        HeadroomManager::set_auto_started_proxy(false);
        return Err(format!(
            "开启本地代理接管失败（请先在「供应商」中配置并选择一个 Claude 供应商）：{e}"
        ));
    }

    Ok(status)
}

/// 关闭 headroom：停止子进程，并按归属决定是否一并关闭本地代理。
async fn disable_headroom(state: &tauri::State<'_, AppState>) -> Result<(), String> {
    HeadroomManager::stop()?;

    if HeadroomManager::take_auto_started_proxy() {
        // 本地代理是 headroom 自动开启的 → 一并关闭
        let _ = state
            .proxy_service
            .set_takeover_for_app("claude", false)
            .await;
    } else if state
        .proxy_service
        .get_takeover_status()
        .await
        .map(|s| s.claude)
        .unwrap_or(false)
    {
        // 用户手动开启的代理 → 保持运行，但把客户端地址从（已停止的）headroom 切回本地代理
        let _ = state
            .proxy_service
            .set_takeover_for_app("claude", true)
            .await;
    }

    Ok(())
}

/// 保存 headroom 配置并协调运行态（含本地代理生命周期）。
#[tauri::command]
pub async fn set_headroom_config(
    state: tauri::State<'_, AppState>,
    config: HeadroomConfig,
) -> Result<HeadroomStatus, String> {
    state
        .db
        .set_headroom_config(&config)
        .map_err(|e| e.to_string())?;

    if config.enabled {
        enable_headroom(&state, &config).await
    } else {
        disable_headroom(&state).await?;
        Ok(HeadroomManager::status())
    }
}

/// 手动启动 headroom（等价于开启：强制开启本地代理接管）。
#[tauri::command]
pub async fn start_headroom(state: tauri::State<'_, AppState>) -> Result<HeadroomStatus, String> {
    let config = state.db.get_headroom_config().map_err(|e| e.to_string())?;
    enable_headroom(&state, &config).await
}

/// 停止 headroom；按归属决定是否一并关闭本地代理。
#[tauri::command]
pub async fn stop_headroom(state: tauri::State<'_, AppState>) -> Result<(), String> {
    disable_headroom(&state).await
}

/// 查询 headroom 运行状态
#[tauri::command]
pub fn get_headroom_status() -> HeadroomStatus {
    HeadroomManager::status()
}
