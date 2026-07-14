//! Connector（cc-connect）进程管理
//!
//! 把精简版 cc-connect 作为子进程启动 / 停止 / 查询状态，桥接消息平台
//! （当前为企业微信 websocket 智能机器人）与 Claude Code。
//!
//! 请求链路：
//!   企业微信 → cc-connect（Claude Code, stream-json）→ headroom(:8787) → 本地代理(:15721) → 供应商
//!
//! cc-connect 通过命令行 `cc-connect --config <path>` 启动，配置文件由
//! Hyper MITM 依据用户设置生成（见 commands/connector.rs）。

use once_cell::sync::Lazy;
use serde::Serialize;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

/// 运行中的 cc-connect 子进程句柄。
static CHILD: Lazy<Mutex<Option<Child>>> = Lazy::new(|| Mutex::new(None));

/// 当前运行态的元信息（用于 status 上报）。
static STATE: Lazy<Mutex<RunState>> = Lazy::new(|| Mutex::new(RunState::default()));

#[derive(Default, Clone)]
struct RunState {
    project_count: usize,
    config_path: Option<String>,
    last_error: Option<String>,
    /// 本地代理是否由 connector 自动开启（关闭 connector 时据此决定是否一并关闭代理）。
    auto_started_proxy: bool,
}

/// connector 运行状态（回传前端）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorStatus {
    /// 子进程是否正在运行
    pub running: bool,
    /// 已加载的项目数
    pub project_count: usize,
    /// 生成的 config.toml 路径
    pub config_path: Option<String>,
    /// 最近一次错误（启动失败 / 进程异常退出）
    pub last_error: Option<String>,
    /// 本地代理是否由 connector 自动开启（用于前端提示）
    pub auto_started_proxy: bool,
}

/// 零尺寸句柄，所有方法操作全局单例进程。
pub struct ConnectorManager;

impl ConnectorManager {
    /// 启动 cc-connect 子进程。
    ///
    /// - `binary`：cc-connect 可执行文件路径
    /// - `config_toml_path`：已生成的 config.toml 路径
    /// - `project_count`：项目数（用于状态展示）
    ///
    /// 若已在运行，会先停止旧进程再以新配置重启。
    pub fn start(
        binary: &Path,
        config_toml_path: &Path,
        project_count: usize,
    ) -> Result<ConnectorStatus, String> {
        // 幂等重启：先停旧进程
        let _ = Self::stop();

        let mut cmd = Command::new(binary);
        cmd.arg("--config").arg(config_toml_path);

        // 不继承 stdin；stdout/stderr 丢弃，避免管道写满阻塞子进程
        cmd.stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        #[cfg(windows)]
        {
            // CREATE_NO_WINDOW: 避免在 Windows 上弹出控制台窗口
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        match cmd.spawn() {
            Ok(child) => {
                *CHILD.lock().map_err(|e| e.to_string())? = Some(child);
                let mut state = STATE.lock().map_err(|e| e.to_string())?;
                state.project_count = project_count;
                state.config_path = Some(config_toml_path.to_string_lossy().to_string());
                state.last_error = None;
                log::info!(
                    "[Connector] 已启动: bin={} config={} projects={}",
                    binary.display(),
                    config_toml_path.display(),
                    project_count
                );
                drop(state);
                Ok(Self::status())
            }
            Err(e) => {
                let msg = format!(
                    "启动 cc-connect 失败（{}）：{e}。请确认 cc-connect 已随应用打包，或在设置中指定可执行文件路径，并确保 `claude` CLI 已安装。",
                    binary.display()
                );
                if let Ok(mut state) = STATE.lock() {
                    state.last_error = Some(msg.clone());
                }
                log::warn!("[Connector] {msg}");
                Err(msg)
            }
        }
    }

    /// 停止 cc-connect 子进程（幂等）。
    pub fn stop() -> Result<(), String> {
        let mut guard = CHILD.lock().map_err(|e| e.to_string())?;
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
            log::info!("[Connector] 已停止");
        }
        Ok(())
    }

    /// 设置「本地代理由 connector 自动开启」标志。
    pub fn set_auto_started_proxy(value: bool) {
        if let Ok(mut s) = STATE.lock() {
            s.auto_started_proxy = value;
        }
    }

    /// 读取并清除「本地代理由 connector 自动开启」标志。
    pub fn take_auto_started_proxy() -> bool {
        if let Ok(mut s) = STATE.lock() {
            let v = s.auto_started_proxy;
            s.auto_started_proxy = false;
            v
        } else {
            false
        }
    }

    /// 子进程是否仍在运行（会回收已退出的子进程）。
    pub fn is_running() -> bool {
        let mut guard = match CHILD.lock() {
            Ok(g) => g,
            Err(_) => return false,
        };
        match guard.as_mut() {
            Some(child) => match child.try_wait() {
                Ok(Some(exit)) => {
                    // 已退出：清理句柄并记录
                    *guard = None;
                    if let Ok(mut state) = STATE.lock() {
                        state.last_error = Some(format!("cc-connect 进程已退出（status: {exit}）"));
                    }
                    false
                }
                Ok(None) => true, // 仍在运行
                Err(_) => true,   // 查询失败时保守认为在运行
            },
            None => false,
        }
    }

    /// 当前状态快照。
    pub fn status() -> ConnectorStatus {
        let running = Self::is_running();
        let state = STATE.lock().ok();
        let (project_count, config_path, last_error, auto_started_proxy) = match state {
            Some(s) => (
                s.project_count,
                s.config_path.clone(),
                s.last_error.clone(),
                s.auto_started_proxy,
            ),
            None => (0, None, None, false),
        };
        ConnectorStatus {
            running,
            project_count,
            config_path,
            last_error,
            auto_started_proxy,
        }
    }
}
