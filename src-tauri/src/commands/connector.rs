//! Connector（cc-connect / 企业微信 ↔ Claude Code 桥接）相关命令
//!
//! 提供 connector 配置读写、进程启停、以及从既有 cc-connect config.toml 导入项目。
//!
//! 请求链路：企业微信 → cc-connect（Claude Code, stream-json）→ headroom(:8787) → 本地代理(:15721) → 供应商
//!
//! 本地代理生命周期与 headroom 一致：
//! - 开启 connector 时**强制**开启 Claude 本地代理接管；若代理此前已由用户/headroom 开启，
//!   则仅复用，不改变其归属。
//! - 关闭 connector 时，仅当本地代理是由 connector 自动开启、且 headroom 未在运行时才一并关闭。

use crate::proxy::types::{ConnectorConfig, ConnectorProject};
use crate::services::{ConnectorManager, ConnectorStatus};
use crate::store::AppState;
use std::path::PathBuf;

/// TOML 基本字符串转义（反斜杠与引号）。
fn toml_escape(v: &str) -> String {
    v.replace('\\', "\\\\").replace('"', "\\\"")
}

/// 解析 cc-connect 可执行文件路径：优先用户指定，否则用随应用打包的 sidecar
/// （位于应用可执行文件同目录）；若该文件不存在（如 dev 模式），回退到 PATH 查找。
fn resolve_binary(config: &ConnectorConfig) -> Result<PathBuf, String> {
    let custom = config.binary_path.trim();
    if !custom.is_empty() {
        return Ok(PathBuf::from(custom));
    }
    let name = if cfg!(windows) {
        "cc-connect.exe"
    } else {
        "cc-connect"
    };
    // 1) 应用同目录（打包后 externalBin 会被安装在此）
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let bundled = dir.join(name);
            if bundled.exists() {
                return Ok(bundled);
            }
        }
    }
    // 2) 回退：依赖 PATH（dev 模式或用户自行安装）
    Ok(PathBuf::from(name))
}

/// 统计有效项目（含机器人 ID 与名称）。
fn count_valid_projects(config: &ConnectorConfig) -> usize {
    config
        .projects
        .iter()
        .filter(|p| !p.name.trim().is_empty() && !p.bot_id.trim().is_empty())
        .count()
}

/// 依据 ConnectorConfig 生成 cc-connect 的 config.toml，写入
/// `~/.hyper-mitm/connector/config.toml`，并返回（路径, 有效项目数）。
///
/// 每个项目固定为 claudecode 智能体 + 企业微信 websocket 平台，
/// 并把 `ANTHROPIC_BASE_URL` 指向 Hyper MITM 链路（headroom 或本地代理）。
fn write_config_toml(config: &ConnectorConfig, base_url: &str) -> Result<(PathBuf, usize), String> {
    let dir = crate::config::get_app_config_dir().join("connector");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建 connector 目录失败: {e}"))?;
    let path = dir.join("config.toml");

    let mut s = String::new();
    s.push_str("language = \"en\"\n\n[log]\nlevel = \"info\"\n\n");

    let mut count = 0usize;
    for p in &config.projects {
        if p.name.trim().is_empty() || p.bot_id.trim().is_empty() {
            continue;
        }
        count += 1;
        let work_dir = if p.work_dir.trim().is_empty() {
            ".".to_string()
        } else {
            p.work_dir.clone()
        };
        let model = if p.model.trim().is_empty() {
            "claude-opus-4-8".to_string()
        } else {
            p.model.clone()
        };
        let mode = if p.mode.trim().is_empty() {
            "default".to_string()
        } else {
            p.mode.clone()
        };
        let allow_from = if p.allow_from.trim().is_empty() {
            "*".to_string()
        } else {
            p.allow_from.clone()
        };

        s.push_str("[[projects]]\n");
        s.push_str(&format!("name = \"{}\"\n\n", toml_escape(&p.name)));
        s.push_str("[projects.agent]\ntype = \"claudecode\"\n\n");
        s.push_str("[projects.agent.options]\n");
        s.push_str(&format!("work_dir = \"{}\"\n", toml_escape(&work_dir)));
        s.push_str(&format!("model = \"{}\"\n", toml_escape(&model)));
        s.push_str(&format!("mode = \"{}\"\n\n", toml_escape(&mode)));
        s.push_str("[projects.agent.options.env]\n");
        s.push_str(&format!(
            "ANTHROPIC_BASE_URL = \"{}\"\n",
            toml_escape(base_url)
        ));
        // 占位令牌：本地代理(:15721)接管时会注入真实供应商凭据
        s.push_str("ANTHROPIC_AUTH_TOKEN = \"hyper-mitm\"\n\n");
        s.push_str("[[projects.platforms]]\ntype = \"wecom\"\n\n");
        s.push_str("[projects.platforms.options]\nmode = \"websocket\"\n");
        s.push_str(&format!("bot_id = \"{}\"\n", toml_escape(&p.bot_id)));
        s.push_str(&format!(
            "bot_secret = \"{}\"\n",
            toml_escape(&p.bot_secret)
        ));
        s.push_str(&format!(
            "allow_from = \"{}\"\n\n",
            toml_escape(&allow_from)
        ));
    }

    std::fs::write(&path, s).map_err(|e| format!("写入 config.toml 失败: {e}"))?;
    Ok((path, count))
}

/// 计算写入 cc-connect 的 base url：headroom 开启则用 headroom origin，否则本地代理 origin。
async fn resolve_base_url(state: &tauri::State<'_, AppState>) -> Result<String, String> {
    let proxy_url = state
        .proxy_service
        .local_proxy_origin()
        .await
        .map_err(|e| format!("无法获取本地代理地址：{e}"))?;
    let headroom_cfg = state.db.get_headroom_config().unwrap_or_default();
    Ok(if headroom_cfg.enabled {
        headroom_cfg.origin()
    } else {
        proxy_url
    })
}

/// 开启 connector：强制开启本地代理接管，生成配置并启动 cc-connect。
async fn enable_connector(
    state: &tauri::State<'_, AppState>,
    config: &ConnectorConfig,
) -> Result<ConnectorStatus, String> {
    if count_valid_projects(config) == 0 {
        return Err("没有可用的项目：至少配置一个含「机器人 ID」的项目".to_string());
    }

    // 1. 本地代理（Claude 接管）此前是否已开启 —— 决定归属
    let was_active = state
        .proxy_service
        .get_takeover_status()
        .await
        .map(|s| s.claude)
        .unwrap_or(false);
    ConnectorManager::set_auto_started_proxy(!was_active);

    // 2. 强制开启本地代理接管（同时按需拉起 headroom）
    if let Err(e) = state.proxy_service.set_takeover_for_app("claude", true).await {
        ConnectorManager::set_auto_started_proxy(false);
        return Err(format!(
            "开启本地代理接管失败（请先在「供应商」中配置并选择一个 Claude 供应商）：{e}"
        ));
    }

    // 3. 计算上游并生成 config.toml
    let base_url = resolve_base_url(state).await?;
    let (path, count) = write_config_toml(config, &base_url)?;
    let binary = resolve_binary(config)?;

    // 4. 启动 cc-connect；失败则回滚自动开启的代理
    match ConnectorManager::start(&binary, &path, count) {
        Ok(status) => Ok(status),
        Err(e) => {
            if ConnectorManager::take_auto_started_proxy() {
                let _ = state
                    .proxy_service
                    .set_takeover_for_app("claude", false)
                    .await;
            }
            Err(e)
        }
    }
}

/// 关闭 connector：停止子进程，并按归属决定是否一并关闭本地代理。
async fn disable_connector(state: &tauri::State<'_, AppState>) -> Result<(), String> {
    ConnectorManager::stop()?;

    if ConnectorManager::take_auto_started_proxy() {
        // 本地代理由 connector 自动开启 → 仅在 headroom 未使用时才关闭
        if !crate::services::HeadroomManager::is_running() {
            let _ = state
                .proxy_service
                .set_takeover_for_app("claude", false)
                .await;
        }
    } else if state
        .proxy_service
        .get_takeover_status()
        .await
        .map(|s| s.claude)
        .unwrap_or(false)
    {
        // 用户/headroom 拥有的代理 → 保持运行
        let _ = state.proxy_service.set_takeover_for_app("claude", true).await;
    }

    Ok(())
}

/// 读取 connector 配置（不存在则返回默认值）
#[tauri::command]
pub fn get_connector_config(state: tauri::State<'_, AppState>) -> Result<ConnectorConfig, String> {
    state.db.get_connector_config().map_err(|e| e.to_string())
}

/// 保存 connector 配置并协调运行态（含本地代理生命周期）。
#[tauri::command]
pub async fn set_connector_config(
    state: tauri::State<'_, AppState>,
    config: ConnectorConfig,
) -> Result<ConnectorStatus, String> {
    state
        .db
        .set_connector_config(&config)
        .map_err(|e| e.to_string())?;

    if config.enabled {
        enable_connector(&state, &config).await
    } else {
        disable_connector(&state).await?;
        Ok(ConnectorManager::status())
    }
}

/// 手动启动 connector（使用已保存配置）。
#[tauri::command]
pub async fn start_connector(state: tauri::State<'_, AppState>) -> Result<ConnectorStatus, String> {
    let config = state.db.get_connector_config().map_err(|e| e.to_string())?;
    enable_connector(&state, &config).await
}

/// 停止 connector；按归属决定是否一并关闭本地代理。
#[tauri::command]
pub async fn stop_connector(state: tauri::State<'_, AppState>) -> Result<(), String> {
    disable_connector(&state).await
}

/// 查询 connector 运行状态
#[tauri::command]
pub fn get_connector_status() -> ConnectorStatus {
    ConnectorManager::status()
}

/// 从既有 cc-connect 的 config.toml 导入项目，强制转换为
/// claudecode 智能体 + Claude 模型 + Hyper MITM 链路路由。返回导入后的配置（已持久化）。
#[tauri::command]
pub fn import_connector_from_ccconnect(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<ConnectorConfig, String> {
    let text =
        std::fs::read_to_string(&path).map_err(|e| format!("读取 {path} 失败: {e}"))?;
    let val: toml::Value =
        toml::from_str(&text).map_err(|e| format!("解析 TOML 失败: {e}"))?;

    let mut projects: Vec<ConnectorProject> = Vec::new();
    if let Some(arr) = val.get("projects").and_then(|v| v.as_array()) {
        for p in arr {
            let name = p
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let work_dir = p
                .get("agent")
                .and_then(|a| a.get("options"))
                .and_then(|o| o.get("work_dir"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            // 取第一个 wecom 平台
            let mut bot_id = String::new();
            let mut bot_secret = String::new();
            let mut allow_from = "*".to_string();
            if let Some(platforms) = p.get("platforms").and_then(|v| v.as_array()) {
                for plat in platforms {
                    if plat.get("type").and_then(|v| v.as_str()) == Some("wecom") {
                        if let Some(o) = plat.get("options") {
                            bot_id = o
                                .get("bot_id")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            bot_secret = o
                                .get("bot_secret")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            allow_from = o
                                .get("allow_from")
                                .and_then(|v| v.as_str())
                                .unwrap_or("*")
                                .to_string();
                        }
                        break;
                    }
                }
            }

            if name.trim().is_empty() || bot_id.trim().is_empty() {
                continue;
            }

            projects.push(ConnectorProject {
                name,
                // cc-connect 的 "." 表示其自身工作目录；导入时清空让用户在 UI 指定真实目录
                work_dir: if work_dir == "." { String::new() } else { work_dir },
                model: "claude-opus-4-8".to_string(),
                mode: "default".to_string(),
                bot_id,
                bot_secret,
                allow_from,
            });
        }
    }

    if projects.is_empty() {
        return Err("未在该 config.toml 中找到含企业微信机器人的项目".to_string());
    }

    let mut cfg = state.db.get_connector_config().map_err(|e| e.to_string())?;
    cfg.projects = projects;
    state
        .db
        .set_connector_config(&cfg)
        .map_err(|e| e.to_string())?;
    Ok(cfg)
}
