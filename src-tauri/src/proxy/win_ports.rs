//! Windows 端口/句柄助手：解决「孤儿子进程继承监听套接字」导致的端口占用问题。
//!
//! 背景：应用通过 `std::process::Command` 启动 headroom / cc-connect 子进程。
//! 在 Windows 上，若本地代理的监听套接字句柄可被继承，子进程会继承它；当应用被
//! 强制结束 / 安装器替换 / 崩溃时，存活的子进程仍持有该套接字，导致下次启动
//! 绑定端口失败（os error 10048, EADDRINUSE）。
//!
//! 两道防线：
//! 1. [`set_non_inheritable`]：绑定后清除监听套接字的 HANDLE_FLAG_INHERIT，
//!    使子进程无法再继承该套接字（杜绝新泄漏）。
//! 2. [`free_port_if_held`]：启动绑定前，查出占用该端口的进程并结束它
//!    （清理旧版本遗留的孤儿）。

#[cfg(windows)]
pub fn set_non_inheritable<S: std::os::windows::io::AsRawSocket>(sock: &S) {
    use windows_sys::Win32::Foundation::{SetHandleInformation, HANDLE_FLAG_INHERIT};
    let handle = sock.as_raw_socket() as usize as *mut core::ffi::c_void;
    // 清除继承标志；失败无害（退而依赖第二道防线）。
    unsafe {
        SetHandleInformation(handle, HANDLE_FLAG_INHERIT, 0);
    }
}

#[cfg(not(windows))]
pub fn set_non_inheritable<S>(_sock: &S) {}

/// 若指定端口被某进程监听占用，结束该进程并返回被结束的 PID。
/// 仅用于本应用自有端口（本地代理 / headroom），清理上一实例遗留的孤儿。
#[cfg(windows)]
pub fn free_port_if_held(port: u16) -> Option<u32> {
    let pid = pid_listening_on(port)?;
    // 不要误伤自己
    if pid == std::process::id() {
        return None;
    }
    if kill_pid(pid) {
        log::warn!("[Ports] 端口 {port} 被遗留进程 PID {pid} 占用，已结束以释放端口");
        Some(pid)
    } else {
        None
    }
}

#[cfg(not(windows))]
pub fn free_port_if_held(_port: u16) -> Option<u32> {
    None
}

#[cfg(windows)]
fn pid_listening_on(port: u16) -> Option<u32> {
    use windows_sys::Win32::NetworkManagement::IpHelper::{
        GetExtendedTcpTable, MIB_TCPTABLE_OWNER_PID, TCP_TABLE_OWNER_PID_LISTENER,
    };

    const AF_INET: u32 = 2;

    unsafe {
        // 第一次调用获取所需缓冲区大小
        let mut size: u32 = 0;
        GetExtendedTcpTable(
            core::ptr::null_mut(),
            &mut size,
            0,
            AF_INET,
            TCP_TABLE_OWNER_PID_LISTENER,
            0,
        );
        if size == 0 {
            return None;
        }

        let mut buf = vec![0u8; size as usize];
        let ret = GetExtendedTcpTable(
            buf.as_mut_ptr() as *mut core::ffi::c_void,
            &mut size,
            0,
            AF_INET,
            TCP_TABLE_OWNER_PID_LISTENER,
            0,
        );
        if ret != 0 {
            return None;
        }

        let table = &*(buf.as_ptr() as *const MIB_TCPTABLE_OWNER_PID);
        let n = table.dwNumEntries as usize;
        let rows = std::slice::from_raw_parts(table.table.as_ptr(), n);
        for row in rows {
            // dwLocalPort 以网络字节序存于低 16 位
            let row_port = (row.dwLocalPort as u16).swap_bytes();
            if row_port == port {
                return Some(row.dwOwningPid);
            }
        }
    }
    None
}

#[cfg(windows)]
fn kill_pid(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, TerminateProcess, PROCESS_TERMINATE,
    };
    unsafe {
        let h = OpenProcess(PROCESS_TERMINATE, 0, pid);
        if h.is_null() {
            return false;
        }
        let ok = TerminateProcess(h, 1) != 0;
        CloseHandle(h);
        ok
    }
}
