/**
 * Headroom（上下文压缩反向代理）集成 API
 *
 * 请求链路：Claude Code → headroom → 本地代理 → 供应商
 */

import { invoke } from "@tauri-apps/api/core";

/** Headroom 配置（与后端 HeadroomConfig 对应，camelCase） */
export interface HeadroomConfig {
  /** 是否在本地代理前置 headroom 压缩层 */
  enabled: boolean;
  /** headroom 监听端口（默认 8787） */
  port: number;
  /** 运行 headroom 的 Python 可执行文件 */
  pythonPath: string;
  /** 优化模式：token | cache */
  mode: string;
  /** 追加到 `headroom proxy` 的额外命令行参数（空格分隔） */
  extraArgs: string;
}

/** Headroom 运行状态 */
export interface HeadroomStatus {
  running: boolean;
  port: number;
  upstream: string | null;
  origin: string | null;
  lastError: string | null;
  /** 本地代理是否由 headroom 自动开启（关闭时会一并关闭） */
  autoStartedProxy: boolean;
}

/** 读取 headroom 配置 */
export async function getHeadroomConfig(): Promise<HeadroomConfig> {
  return invoke<HeadroomConfig>("get_headroom_config");
}

/** 保存配置并协调进程（enabled 时启动 / 否则停止），返回最新状态 */
export async function setHeadroomConfig(
  config: HeadroomConfig,
): Promise<HeadroomStatus> {
  try {
    return await invoke<HeadroomStatus>("set_headroom_config", { config });
  } catch (error) {
    throw new Error(typeof error === "string" ? error : String(error));
  }
}

/** 手动启动 headroom（使用已保存配置） */
export async function startHeadroom(): Promise<HeadroomStatus> {
  try {
    return await invoke<HeadroomStatus>("start_headroom");
  } catch (error) {
    throw new Error(typeof error === "string" ? error : String(error));
  }
}

/** 停止 headroom */
export async function stopHeadroom(): Promise<void> {
  return invoke("stop_headroom");
}

/** 查询 headroom 运行状态 */
export async function getHeadroomStatus(): Promise<HeadroomStatus> {
  return invoke<HeadroomStatus>("get_headroom_status");
}
