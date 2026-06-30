//! Headroom 进程管理
//!
//! 负责把 headroom（上下文压缩反向代理）作为子进程启动 / 停止 / 查询状态。
//!
//! 请求链路：
//!   Claude Code → headroom(:port) → Hyper MITM 本地代理(:listen_port) → 供应商
//!
//! headroom 通过命令行 `python -m headroom.cli proxy --port <port>` 启动，
//! 其上游由环境变量 `ANTHROPIC_TARGET_API_URL` 指定（指回本地代理）。

use crate::proxy::types::HeadroomConfig;
use once_cell::sync::Lazy;
use serde::Serialize;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

/// 运行中的 headroom 子进程句柄。
static CHILD: Lazy<Mutex<Option<Child>>> = Lazy::new(|| Mutex::new(None));

/// 当前运行态的元信息（用于 status 上报）。
static STATE: Lazy<Mutex<RunState>> = Lazy::new(|| Mutex::new(RunState::default()));

#[derive(Default, Clone)]
struct RunState {
    port: u16,
    upstream: Option<String>,
    last_error: Option<String>,
    /// 本地代理是否由 headroom 自动开启（关闭 headroom 时据此决定是否一并关闭代理）。
    auto_started_proxy: bool,
}

/// headroom 运行状态（回传前端）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadroomStatus {
    /// 子进程是否正在运行
    pub running: bool,
    /// 监听端口
    pub port: u16,
    /// 上游地址（本地代理 origin）
    pub upstream: Option<String>,
    /// 客户端应连接的 headroom origin（http://127.0.0.1:<port>）
    pub origin: Option<String>,
    /// 最近一次错误（启动失败 / 进程异常退出）
    pub last_error: Option<String>,
    /// 本地代理是否由 headroom 自动开启（用于前端提示）
    pub auto_started_proxy: bool,
}

/// 零尺寸句柄，所有方法操作全局单例进程。
pub struct HeadroomManager;

impl HeadroomManager {
    /// 启动 headroom 子进程。
    ///
    /// - `config`：headroom 配置（端口 / python / 模式 / 额外参数）
    /// - `upstream_base_url`：headroom 的上游（通常是本地代理 origin，如 `http://127.0.0.1:15721`）
    ///
    /// 若已在运行，会先停止旧进程再以新配置重启（保证端口 / 上游一致）。
    pub fn start(config: &HeadroomConfig, upstream_base_url: &str) -> Result<HeadroomStatus, String> {
        // 幂等重启：先停旧进程
        let _ = Self::stop();

        // 清理上一实例遗留的、占用 headroom 端口的孤儿进程
        crate::proxy::win_ports::free_port_if_held(config.port);

        let mut cmd = Command::new(&config.python_path);
        cmd.arg("-m")
            .arg("headroom.cli")
            .arg("proxy")
            .arg("--port")
            .arg(config.port.to_string())
            .arg("--mode")
            .arg(&config.mode);

        // headroom >= 0.26 改用 --anthropic-api-url 指定上游地址
        cmd.arg("--anthropic-api-url");
        cmd.arg(upstream_base_url);

        // 追加用户自定义参数（空格分隔）
        for extra in config.extra_args.split_whitespace() {
            cmd.arg(extra);
        }

        // 同时保留环境变量兜底（旧版本 headroom 兼容 + resolve_api_overrides 仍会读取）
        cmd.env("ANTHROPIC_TARGET_API_URL", upstream_base_url);
        cmd.env("HEADROOM_PORT", config.port.to_string());
        // HyperMITM 的本地代理使用 hyper HTTP/1.1，headroom 的 httpx 默认 HTTP/2 协商会失败
        cmd.env("HEADROOM_HTTP2", "false");

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
                state.port = config.port;
                state.upstream = Some(upstream_base_url.to_string());
                state.last_error = None;
                log::info!(
                    "[Headroom] 已启动: port={} upstream={} mode={}",
                    config.port,
                    upstream_base_url,
                    config.mode
                );
                drop(state);
                Ok(Self::status())
            }
            Err(e) => {
                let msg = format!(
                    "启动 headroom 失败（{} -m headroom.cli）：{e}。请确认已安装 headroom（pip install headroom）且 python 路径正确。",
                    config.python_path
                );
                if let Ok(mut state) = STATE.lock() {
                    state.last_error = Some(msg.clone());
                }
                log::warn!("[Headroom] {msg}");
                Err(msg)
            }
        }
    }

    /// 确保 headroom 以给定配置 / 上游运行：已在运行且端口与上游一致则跳过，
    /// 否则（重）启动。用于接管路径上的幂等调用，避免每次切换供应商都重启进程。
    pub fn ensure(config: &HeadroomConfig, upstream_base_url: &str) -> Result<HeadroomStatus, String> {
        let s = Self::status();
        if s.running && s.port == config.port && s.upstream.as_deref() == Some(upstream_base_url) {
            return Ok(s);
        }
        Self::start(config, upstream_base_url)
    }

    /// 停止 headroom 子进程（幂等）。
    pub fn stop() -> Result<(), String> {
        let mut guard = CHILD.lock().map_err(|e| e.to_string())?;
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
            log::info!("[Headroom] 已停止");
        }
        Ok(())
    }

    /// 设置「本地代理由 headroom 自动开启」标志。
    pub fn set_auto_started_proxy(value: bool) {
        if let Ok(mut s) = STATE.lock() {
            s.auto_started_proxy = value;
        }
    }

    /// 读取并清除「本地代理由 headroom 自动开启」标志。
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
                        state.last_error =
                            Some(format!("headroom 进程已退出（status: {exit}）"));
                    }
                    false
                }
                Ok(None) => true,        // 仍在运行
                Err(_) => true,           // 查询失败时保守认为在运行
            },
            None => false,
        }
    }

    /// 当前状态快照。
    pub fn status() -> HeadroomStatus {
        let running = Self::is_running();
        let state = STATE.lock().ok();
        let (port, upstream, last_error, auto_started_proxy) = match state {
            Some(s) => (
                s.port,
                s.upstream.clone(),
                s.last_error.clone(),
                s.auto_started_proxy,
            ),
            None => (0, None, None, false),
        };
        let origin = if port != 0 {
            Some(format!("http://127.0.0.1:{port}"))
        } else {
            None
        };
        HeadroomStatus {
            running,
            port,
            upstream,
            origin,
            last_error,
            auto_started_proxy,
        }
    }
}
