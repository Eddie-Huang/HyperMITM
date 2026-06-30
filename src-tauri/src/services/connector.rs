//! Connector锛坈c-connect锛夎繘绋嬬鐞?//!
//! 鎶婄簿绠€鐗?cc-connect 浣滀负瀛愯繘绋嬪惎鍔?/ 鍋滄 / 鏌ヨ鐘舵€侊紝妗ユ帴娑堟伅骞冲彴
//! 锛堝綋鍓嶄负浼佷笟寰俊 websocket 鏅鸿兘鏈哄櫒浜猴級涓?Claude Code銆?//!
//! 璇锋眰閾捐矾锛?//!   浼佷笟寰俊 鈫?cc-connect锛圕laude Code, stream-json锛夆啋 headroom(:8787) 鈫?鏈湴浠ｇ悊(:15721) 鈫?渚涘簲鍟?//!
//! cc-connect 閫氳繃鍛戒护琛?`cc-connect --config <path>` 鍚姩锛岄厤缃枃浠剁敱
//! Hyper MITM 渚濇嵁鐢ㄦ埛璁剧疆鐢熸垚锛堣 commands/connector.rs锛夈€?
use once_cell::sync::Lazy;
use serde::Serialize;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

/// 杩愯涓殑 cc-connect 瀛愯繘绋嬪彞鏌勩€?static CHILD: Lazy<Mutex<Option<Child>>> = Lazy::new(|| Mutex::new(None));

/// 褰撳墠杩愯鎬佺殑鍏冧俊鎭紙鐢ㄤ簬 status 涓婃姤锛夈€?static STATE: Lazy<Mutex<RunState>> = Lazy::new(|| Mutex::new(RunState::default()));

#[derive(Default, Clone)]
struct RunState {
    project_count: usize,
    config_path: Option<String>,
    last_error: Option<String>,
    /// 鏈湴浠ｇ悊鏄惁鐢?connector 鑷姩寮€鍚紙鍏抽棴 connector 鏃舵嵁姝ゅ喅瀹氭槸鍚︿竴骞跺叧闂唬鐞嗭級銆?    auto_started_proxy: bool,
}

/// connector 杩愯鐘舵€侊紙鍥炰紶鍓嶇锛夈€?#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorStatus {
    /// 瀛愯繘绋嬫槸鍚︽鍦ㄨ繍琛?    pub running: bool,
    /// 宸插姞杞界殑椤圭洰鏁?    pub project_count: usize,
    /// 鐢熸垚鐨?config.toml 璺緞
    pub config_path: Option<String>,
    /// 鏈€杩戜竴娆￠敊璇紙鍚姩澶辫触 / 杩涚▼寮傚父閫€鍑猴級
    pub last_error: Option<String>,
    /// 鏈湴浠ｇ悊鏄惁鐢?connector 鑷姩寮€鍚紙鐢ㄤ簬鍓嶇鎻愮ず锛?    pub auto_started_proxy: bool,
}

/// 闆跺昂瀵稿彞鏌勶紝鎵€鏈夋柟娉曟搷浣滃叏灞€鍗曚緥杩涚▼銆?pub struct ConnectorManager;

impl ConnectorManager {
    /// 鍚姩 cc-connect 瀛愯繘绋嬨€?    ///
    /// - `binary`锛歝c-connect 鍙墽琛屾枃浠惰矾寰?    /// - `config_toml_path`锛氬凡鐢熸垚鐨?config.toml 璺緞
    /// - `project_count`锛氶」鐩暟锛堢敤浜庣姸鎬佸睍绀猴級
    ///
    /// 鑻ュ凡鍦ㄨ繍琛岋紝浼氬厛鍋滄鏃ц繘绋嬪啀浠ユ柊閰嶇疆閲嶅惎銆?    pub fn start(
        binary: &Path,
        config_toml_path: &Path,
        project_count: usize,
    ) -> Result<ConnectorStatus, String> {
        // 骞傜瓑閲嶅惎锛氬厛鍋滄棫杩涚▼
        let _ = Self::stop();

        let mut cmd = Command::new(binary);
        cmd.arg("--config").arg(config_toml_path);

        // 涓嶇户鎵?stdin锛泂tdout/stderr 涓㈠純锛岄伩鍏嶇閬撳啓婊￠樆濉炲瓙杩涚▼
        cmd.stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        #[cfg(windows)]
        {
            // CREATE_NO_WINDOW: 閬垮厤鍦?Windows 涓婂脊鍑烘帶鍒跺彴绐楀彛
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        // Redirect logs to file for debugging
        cmd.env("CC_LOG_FILE", config_toml_path.with_file_name("cc-connect.log"));

        match cmd.spawn() {
            Ok(child) => {
                *CHILD.lock().map_err(|e| e.to_string())? = Some(child);
                let mut state = STATE.lock().map_err(|e| e.to_string())?;
                state.project_count = project_count;
                state.config_path = Some(config_toml_path.to_string_lossy().to_string());
                state.last_error = None;
                log::info!(
                    "[Connector] 宸插惎鍔? bin={} config={} projects={}",
                    binary.display(),
                    config_toml_path.display(),
                    project_count
                );
                drop(state);
                Ok(Self::status())
            }
            Err(e) => {
                let msg = format!(
                    "鍚姩 cc-connect 澶辫触锛坽}锛夛細{e}銆傝纭 cc-connect 宸查殢搴旂敤鎵撳寘锛屾垨鍦ㄨ缃腑鎸囧畾鍙墽琛屾枃浠惰矾寰勶紝骞剁‘淇?`claude` CLI 宸插畨瑁呫€?,
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

    /// 鍋滄 cc-connect 瀛愯繘绋嬶紙骞傜瓑锛夈€?    pub fn stop() -> Result<(), String> {
        let mut guard = CHILD.lock().map_err(|e| e.to_string())?;
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
            log::info!("[Connector] 宸插仠姝?);
        }
        Ok(())
    }

    /// 璁剧疆銆屾湰鍦颁唬鐞嗙敱 connector 鑷姩寮€鍚€嶆爣蹇椼€?    pub fn set_auto_started_proxy(value: bool) {
        if let Ok(mut s) = STATE.lock() {
            s.auto_started_proxy = value;
        }
    }

    /// 璇诲彇骞舵竻闄ゃ€屾湰鍦颁唬鐞嗙敱 connector 鑷姩寮€鍚€嶆爣蹇椼€?    pub fn take_auto_started_proxy() -> bool {
        if let Ok(mut s) = STATE.lock() {
            let v = s.auto_started_proxy;
            s.auto_started_proxy = false;
            v
        } else {
            false
        }
    }

    /// 瀛愯繘绋嬫槸鍚︿粛鍦ㄨ繍琛岋紙浼氬洖鏀跺凡閫€鍑虹殑瀛愯繘绋嬶級銆?    pub fn is_running() -> bool {
        let mut guard = match CHILD.lock() {
            Ok(g) => g,
            Err(_) => return false,
        };
        match guard.as_mut() {
            Some(child) => match child.try_wait() {
                Ok(Some(exit)) => {
                    // 宸查€€鍑猴細娓呯悊鍙ユ焺骞惰褰?                    *guard = None;
                    if let Ok(mut state) = STATE.lock() {
                        state.last_error = Some(format!("cc-connect 杩涚▼宸查€€鍑猴紙status: {exit}锛?));
                    }
                    false
                }
                Ok(None) => true, // 浠嶅湪杩愯
                Err(_) => true,   // 鏌ヨ澶辫触鏃朵繚瀹堣涓哄湪杩愯
            },
            None => false,
        }
    }

    /// 褰撳墠鐘舵€佸揩鐓с€?    pub fn status() -> ConnectorStatus {
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
