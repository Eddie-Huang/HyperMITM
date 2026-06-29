/**
 * Connector（cc-connect / 企业微信 ↔ Claude Code 桥接）集成 API
 *
 * 请求链路：企业微信 → cc-connect（Claude Code, stream-json）→ headroom → 本地代理 → 供应商
 */

import { invoke } from "@tauri-apps/api/core";

/** 单个 connector 项目（与后端 ConnectorProject 对应，camelCase） */
export interface ConnectorProject {
  /** 项目名（唯一） */
  name: string;
  /** Claude Code 工作目录 */
  workDir: string;
  /** 模型（须为 Claude 模型才能用 skills/MCP） */
  model: string;
  /** 权限模式：default | acceptEdits | plan | auto | bypassPermissions */
  mode: string;
  /** 企业微信 websocket 智能机器人 ID */
  botId: string;
  /** 企业微信机器人密钥 */
  botSecret: string;
  /** 允许触达的用户（"*" 表示全部） */
  allowFrom: string;
  /** 上下文窗口大小（tokens），connector 启动时自动从供应商注入，0 表示由 cc-connect 自动推断 */
  contextWindow?: number;
  /** 上下文满时自动触发 /compact（默认 true） */
  autoCompressEnabled?: boolean;
  /** 自动压缩 token 阈值（0 = 从模型自动推算） */
  autoCompressMaxTokens?: number;
  /** 自动压缩最小间隔分钟数（默认 30） */
  autoCompressMinGapMins?: number;
  /** API 错误导致会话终止时自动重试（默认 true） */
  autoResumeEnabled?: boolean;
  /** 自动恢复最大重试次数（默认 3） */
  autoResumeMaxAttempts?: number;
  /** 自动恢复初始延迟秒数（默认 5） */
  autoResumeInitialDelaySecs?: number;
}

/** Connector 总配置（与后端 ConnectorConfig 对应） */
export interface ConnectorConfig {
  /** 总开关 */
  enabled: boolean;
  /** cc-connect 可执行文件路径（空 = 使用随应用打包的 sidecar） */
  binaryPath: string;
  /** 项目列表 */
  projects: ConnectorProject[];
}

/** Connector 运行状态 */
export interface ConnectorStatus {
  running: boolean;
  projectCount: number;
  configPath: string | null;
  lastError: string | null;
  /** 本地代理是否由 connector 自动开启（关闭时会一并关闭） */
  autoStartedProxy: boolean;
}

/** 读取 connector 配置 */
export async function getConnectorConfig(): Promise<ConnectorConfig> {
  return invoke<ConnectorConfig>("get_connector_config");
}

/** 保存配置并协调进程（enabled 时启动 / 否则停止），返回最新状态 */
export async function setConnectorConfig(
  config: ConnectorConfig,
): Promise<ConnectorStatus> {
  try {
    return await invoke<ConnectorStatus>("set_connector_config", { config });
  } catch (error) {
    throw new Error(typeof error === "string" ? error : String(error));
  }
}

/** 手动启动 connector（使用已保存配置） */
export async function startConnector(): Promise<ConnectorStatus> {
  try {
    return await invoke<ConnectorStatus>("start_connector");
  } catch (error) {
    throw new Error(typeof error === "string" ? error : String(error));
  }
}

/** 停止 connector */
export async function stopConnector(): Promise<void> {
  return invoke("stop_connector");
}

/** 查询 connector 运行状态 */
export async function getConnectorStatus(): Promise<ConnectorStatus> {
  return invoke<ConnectorStatus>("get_connector_status");
}

/** 从既有 cc-connect config.toml 导入项目（强制转换为 claudecode + Claude 模型 + 链路路由） */
export async function importConnectorFromCcConnect(
  path: string,
): Promise<ConnectorConfig> {
  try {
    return await invoke<ConnectorConfig>("import_connector_from_ccconnect", {
      path,
    });
  } catch (error) {
    throw new Error(typeof error === "string" ? error : String(error));
  }
}
