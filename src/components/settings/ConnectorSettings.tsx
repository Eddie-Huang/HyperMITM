/**
 * Connector（cc-connect / 企业微信 ↔ Claude Code 桥接）集成设置
 *
 * 启用后，Hyper MITM 会把内嵌的 cc-connect 作为子进程启动：
 *   企业微信 → cc-connect（Claude Code, stream-json）→ headroom → 本地代理 → 供应商
 *
 * 每个项目 = 一个工作目录 + 一个企业微信 websocket 智能机器人。
 * 需本机已安装 `claude` CLI。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Loader2,
  Play,
  Square,
  RotateCw,
  Plus,
  Trash2,
  FolderSearch,
  Download,
  Bot,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleRow } from "@/components/ui/toggle-row";
import {
  getConnectorConfig,
  getConnectorStatus,
  setConnectorConfig,
  startConnector,
  stopConnector,
  importConnectorFromCcConnect,
  type ConnectorConfig,
  type ConnectorProject,
  type ConnectorStatus,
} from "@/lib/api/connector";

const DEFAULT_CONFIG: ConnectorConfig = {
  enabled: false,
  binaryPath: "",
  projects: [],
};

const PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "plan",
  "auto",
  "bypassPermissions",
];

const newProject = (): ConnectorProject => ({
  name: "",
  workDir: "",
  model: "claude-opus-4-8",
  mode: "default",
  botId: "",
  botSecret: "",
  allowFrom: "*",
});

export function ConnectorSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<ConnectorConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<ConnectorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cfg, st] = await Promise.all([
          getConnectorConfig(),
          getConnectorStatus(),
        ]);
        if (!cancelled) {
          setConfig(cfg);
          setStatus(st);
        }
      } catch (e) {
        console.error("load connector config failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patchProject = (idx: number, updates: Partial<ConnectorProject>) =>
    setConfig((prev) => ({
      ...prev,
      projects: prev.projects.map((p, i) =>
        i === idx ? { ...p, ...updates } : p,
      ),
    }));

  const addProject = () =>
    setConfig((prev) => ({ ...prev, projects: [...prev.projects, newProject()] }));

  const removeProject = (idx: number) =>
    setConfig((prev) => ({
      ...prev,
      projects: prev.projects.filter((_, i) => i !== idx),
    }));

  const browseWorkDir = async (idx: number) => {
    try {
      const picked = await open({ directory: true, multiple: false });
      if (typeof picked === "string") patchProject(idx, { workDir: picked });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleImport = async () => {
    try {
      const picked = await open({
        multiple: false,
        filters: [{ name: "TOML", extensions: ["toml"] }],
      });
      if (typeof picked !== "string") return;
      const cfg = await importConnectorFromCcConnect(picked);
      setConfig((prev) => ({ ...prev, projects: cfg.projects }));
      toast.success(
        t("settings.connector.imported", {
          count: cfg.projects.length,
          defaultValue: `已导入 ${cfg.projects.length} 个项目`,
        }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSave = async (next: ConnectorConfig) => {
    setSaving(true);
    try {
      const st = await setConnectorConfig(next);
      setConfig(next);
      setStatus(st);
      if (next.enabled && st.autoStartedProxy) {
        toast.success(
          t("settings.connector.enabledAuto", {
            defaultValue: "Connector 已启用，并已自动开启本地代理",
          }),
        );
      } else {
        toast.success(
          t("settings.connector.saved", { defaultValue: "Connector 配置已保存" }),
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const refreshStatus = async () => {
    try {
      setStatus(await getConnectorStatus());
    } catch (e) {
      console.error(e);
    }
  };

  const handleStart = async () => {
    setBusy(true);
    try {
      const st = await startConnector();
      setStatus(st);
      toast.success(
        st.autoStartedProxy
          ? t("settings.connector.startedAuto", {
              defaultValue: "Connector 已启动，并已自动开启本地代理",
            })
          : t("settings.connector.started", { defaultValue: "Connector 已启动" }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await stopConnector();
      await refreshStatus();
      toast.success(
        t("settings.connector.stopped", { defaultValue: "Connector 已停止" }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const running = status?.running ?? false;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("settings.connector.hint", {
          defaultValue:
            "把消息平台桥接到 Claude Code：企业微信 → cc-connect → headroom → 本地代理 → 供应商。开启时会自动开启本地代理接管；每个项目须使用 Claude 模型，并已安装 `claude` CLI。",
        })}
      </p>

      {/* 与独立 cc-connect 守护进程冲突提醒 */}
      <p className="text-xs text-amber-600 dark:text-amber-500">
        {t("settings.connector.daemonWarning", {
          defaultValue:
            "⚠️ 若已用独立的 cc-connect 守护进程驱动同一批机器人，请先停止它，避免同一机器人被重复连接。",
        })}
      </p>

      {/* 启用开关 */}
      <ToggleRow
        icon={<Bot className="h-4 w-4 text-indigo-500" />}
        title={t("settings.connector.enable", { defaultValue: "启用 Connector" })}
        description={t("settings.connector.enableDescription", {
          defaultValue:
            "开启后自动开启本地代理接管，并启动内嵌 cc-connect 桥接企业微信与 Claude Code",
        })}
        checked={config.enabled}
        onCheckedChange={(checked) => handleSave({ ...config, enabled: checked })}
      />

      {/* 工具栏：导入 / 新增 */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleImport}>
          <Download className="mr-2 h-4 w-4" />
          {t("settings.connector.import", { defaultValue: "从 cc-connect 导入" })}
        </Button>
        <Button variant="outline" size="sm" onClick={addProject}>
          <Plus className="mr-2 h-4 w-4" />
          {t("settings.connector.addProject", { defaultValue: "新增项目" })}
        </Button>
      </div>

      {/* 项目列表 */}
      {config.projects.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {t("settings.connector.empty", {
            defaultValue: "暂无项目。点击「从 cc-connect 导入」或「新增项目」。",
          })}
        </p>
      )}

      <div className="space-y-3">
        {config.projects.map((p, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-border/50 p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <Input
                placeholder={t("settings.connector.name", {
                  defaultValue: "项目名",
                })}
                value={p.name}
                onChange={(e) => patchProject(idx, { name: e.target.value })}
                className="text-sm font-medium"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeProject(idx)}
                title={t("settings.connector.removeProject", {
                  defaultValue: "删除项目",
                })}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>

            {/* 工作目录 */}
            <div className="flex gap-2">
              <Input
                placeholder="F:\\Projects\\HyperFlow"
                value={p.workDir}
                onChange={(e) => patchProject(idx, { workDir: e.target.value })}
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => browseWorkDir(idx)}
                title={t("settings.connector.browse", { defaultValue: "选择目录" })}
              >
                <FolderSearch className="h-4 w-4" />
              </Button>
            </div>

            {/* 模型 + 模式 */}
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">
                  {t("settings.connector.model", { defaultValue: "模型" })}
                </label>
                <Input
                  placeholder="claude-opus-4-8"
                  value={p.model}
                  onChange={(e) => patchProject(idx, { model: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">
                  {t("settings.connector.mode", { defaultValue: "权限模式" })}
                </label>
                <select
                  value={p.mode}
                  onChange={(e) => patchProject(idx, { mode: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {PERMISSION_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 企业微信机器人 */}
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">
                  {t("settings.connector.botId", { defaultValue: "机器人 ID" })}
                </label>
                <Input
                  placeholder="aib..."
                  value={p.botId}
                  onChange={(e) => patchProject(idx, { botId: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">
                  {t("settings.connector.botSecret", {
                    defaultValue: "机器人密钥",
                  })}
                </label>
                <Input
                  type="password"
                  placeholder="••••••"
                  value={p.botSecret}
                  onChange={(e) =>
                    patchProject(idx, { botSecret: e.target.value })
                  }
                  className="font-mono text-xs"
                />
              </div>
              <div className="w-24 space-y-1">
                <label className="text-xs text-muted-foreground">
                  {t("settings.connector.allowFrom", { defaultValue: "允许用户" })}
                </label>
                <Input
                  placeholder="*"
                  value={p.allowFrom}
                  onChange={(e) =>
                    patchProject(idx, { allowFrom: e.target.value })
                  }
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 可执行文件路径（可选） */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">
          {t("settings.connector.binaryPath", {
            defaultValue: "cc-connect 可执行文件（留空使用内置）",
          })}
        </label>
        <Input
          placeholder={t("settings.connector.binaryPathPlaceholder", {
            defaultValue: "留空 = 使用随应用打包的 cc-connect",
          })}
          value={config.binaryPath}
          onChange={(e) =>
            setConfig((prev) => ({ ...prev, binaryPath: e.target.value }))
          }
          className="font-mono text-xs"
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2">
        <Button onClick={() => handleSave(config)} disabled={saving} size="sm">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("common.save", { defaultValue: "保存" })}
        </Button>
        <Button variant="outline" size="sm" onClick={handleStart} disabled={busy}>
          <Play className="mr-2 h-4 w-4" />
          {t("settings.connector.start", { defaultValue: "启动" })}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleStop}
          disabled={busy || !running}
        >
          <Square className="mr-2 h-4 w-4" />
          {t("settings.connector.stop", { defaultValue: "停止" })}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={refreshStatus}
          title={t("settings.connector.refresh", { defaultValue: "刷新状态" })}
        >
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>

      {/* 状态行 */}
      <div className="rounded-lg border border-border/50 p-3 text-sm space-y-1">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              running ? "bg-green-500 animate-pulse" : "bg-muted-foreground/50"
            }`}
          />
          <span className="font-medium">
            {running
              ? t("settings.connector.running", { defaultValue: "运行中" })
              : t("settings.connector.stoppedState", { defaultValue: "未运行" })}
          </span>
          {status && status.projectCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {t("settings.connector.projectCount", {
                count: status.projectCount,
                defaultValue: `${status.projectCount} 个项目`,
              })}
            </span>
          )}
        </div>
        {status?.configPath && (
          <p className="text-xs text-muted-foreground font-mono">
            {status.configPath}
          </p>
        )}
        {status?.autoStartedProxy && (
          <p className="text-xs text-muted-foreground">
            {t("settings.connector.autoProxyNote", {
              defaultValue:
                "本地代理由 Connector 自动开启，关闭时若 headroom 未运行会一并关闭",
            })}
          </p>
        )}
        {status?.lastError && (
          <p className="text-xs text-red-500">{status.lastError}</p>
        )}
      </div>
    </div>
  );
}
