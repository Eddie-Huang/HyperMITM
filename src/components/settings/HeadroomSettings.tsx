/**
 * Headroom 集成设置
 *
 * 启用后，Hyper MITM 会在本地代理之前再启动一层 headroom 压缩反向代理：
 *   Claude Code → headroom(:port) → 本地代理 → 供应商
 *
 * 需要本机已安装 headroom（pip install headroom）。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Play, Square, RotateCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleRow } from "@/components/ui/toggle-row";
import { Sparkles } from "lucide-react";
import {
  getHeadroomConfig,
  getHeadroomStatus,
  setHeadroomConfig,
  startHeadroom,
  stopHeadroom,
  type HeadroomConfig,
  type HeadroomStatus,
} from "@/lib/api/headroom";

const DEFAULT_CONFIG: HeadroomConfig = {
  enabled: false,
  port: 8787,
  pythonPath: "python",
  mode: "token",
  extraArgs: "",
};

export function HeadroomSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<HeadroomConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<HeadroomStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  // 初次加载配置 + 状态
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cfg, st] = await Promise.all([
          getHeadroomConfig(),
          getHeadroomStatus(),
        ]);
        if (!cancelled) {
          setConfig(cfg);
          setStatus(st);
        }
      } catch (e) {
        console.error("load headroom config failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = (updates: Partial<HeadroomConfig>) =>
    setConfig((prev) => ({ ...prev, ...updates }));

  const handleSave = async (next: HeadroomConfig) => {
    setSaving(true);
    try {
      const st = await setHeadroomConfig(next);
      setConfig(next);
      setStatus(st);
      if (next.enabled && st.autoStartedProxy) {
        toast.success(
          t("settings.headroom.enabledAuto", {
            defaultValue: "Headroom 已启用，并已自动开启本地代理",
          }),
        );
      } else {
        toast.success(
          t("settings.headroom.saved", { defaultValue: "Headroom 配置已保存" }),
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
      setStatus(await getHeadroomStatus());
    } catch (e) {
      console.error(e);
    }
  };

  const handleStart = async () => {
    setBusy(true);
    try {
      const st = await startHeadroom();
      setStatus(st);
      toast.success(
        st.autoStartedProxy
          ? t("settings.headroom.startedAuto", {
              defaultValue: "Headroom 已启动，并已自动开启本地代理",
            })
          : t("settings.headroom.started", { defaultValue: "Headroom 已启动" }),
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
      await stopHeadroom();
      await refreshStatus();
      toast.success(
        t("settings.headroom.stopped", { defaultValue: "Headroom 已停止" }),
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
        {t("settings.headroom.hint", {
          defaultValue:
            "在本地代理之前前置 headroom 压缩层：Claude Code → headroom → 本地代理 → 供应商。开启时会自动开启本地代理接管；需已安装 headroom（pip install headroom）。",
        })}
      </p>

      {/* 启用开关：切换即保存并启停进程 */}
      <ToggleRow
        icon={<Sparkles className="h-4 w-4 text-pink-500" />}
        title={t("settings.headroom.enable", { defaultValue: "启用 Headroom" })}
        description={t("settings.headroom.enableDescription", {
          defaultValue:
            "开启后自动开启本地代理接管，并把客户端指向 headroom 转发到本地代理；关闭时若代理是自动开启的会一并关闭",
        })}
        checked={config.enabled}
        onCheckedChange={(checked) =>
          handleSave({ ...config, enabled: checked })
        }
      />

      {/* 端口 + 模式 */}
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <label className="text-xs text-muted-foreground">
            {t("settings.headroom.port", { defaultValue: "端口" })}
          </label>
          <Input
            type="number"
            value={config.port}
            onChange={(e) =>
              patch({ port: Number(e.target.value) || DEFAULT_CONFIG.port })
            }
            className="font-mono text-sm"
          />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-xs text-muted-foreground">
            {t("settings.headroom.mode", { defaultValue: "模式" })}
          </label>
          <select
            value={config.mode}
            onChange={(e) => patch({ mode: e.target.value })}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            <option value="token">token</option>
            <option value="cache">cache</option>
          </select>
        </div>
      </div>

      {/* Python 路径 */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">
          {t("settings.headroom.python", {
            defaultValue: "Python 可执行文件",
          })}
        </label>
        <Input
          placeholder="python / C:\\Python\\python.exe"
          value={config.pythonPath}
          onChange={(e) => patch({ pythonPath: e.target.value })}
          className="font-mono text-sm"
        />
      </div>

      {/* 额外参数 */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">
          {t("settings.headroom.extraArgs", {
            defaultValue: "额外参数（可选）",
          })}
        </label>
        <Input
          placeholder="--no-cache --intercept-tool-results"
          value={config.extraArgs}
          onChange={(e) => patch({ extraArgs: e.target.value })}
          className="font-mono text-sm"
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2">
        <Button onClick={() => handleSave(config)} disabled={saving} size="sm">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("common.save", { defaultValue: "保存" })}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleStart}
          disabled={busy}
        >
          <Play className="mr-2 h-4 w-4" />
          {t("settings.headroom.start", { defaultValue: "启动" })}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleStop}
          disabled={busy || !running}
        >
          <Square className="mr-2 h-4 w-4" />
          {t("settings.headroom.stop", { defaultValue: "停止" })}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={refreshStatus}
          title={t("settings.headroom.refresh", { defaultValue: "刷新状态" })}
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
              ? t("settings.headroom.running", { defaultValue: "运行中" })
              : t("settings.headroom.stoppedState", { defaultValue: "未运行" })}
          </span>
          {status?.origin && (
            <span className="font-mono text-xs text-muted-foreground">
              {status.origin}
            </span>
          )}
        </div>
        {status?.upstream && (
          <p className="text-xs text-muted-foreground font-mono">
            → {status.upstream}
          </p>
        )}
        {status?.autoStartedProxy && (
          <p className="text-xs text-muted-foreground">
            {t("settings.headroom.autoProxyNote", {
              defaultValue:
                "本地代理由 Headroom 自动开启，关闭 Headroom 时会一并关闭",
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
