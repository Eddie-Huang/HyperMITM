import { RefreshCw, WifiOff, MessageSquare, Clock, FolderOpen } from "lucide-react";
import type { UsageSummary, ProxyStatus } from "../api";

function fmt(n: number | undefined | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function fmtCurrency(n: number | undefined | null): string {
  if (n == null) return "—";
  return "$" + n.toFixed(2);
}

function fmtPct(n: number | undefined | null): string {
  if (n == null) return "—";
  return (n * 100).toFixed(1) + "%";
}

function fmtTs(ts: string | undefined | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export function Dashboard({
  usage,
  proxyStatus,
  loading,
  onRefresh,
}: {
  usage: UsageSummary | null;
  proxyStatus: ProxyStatus | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Hyper MITM Monitor</h1>
          {proxyStatus && (
            <span className="text-sm text-muted-foreground">
              Proxy:{" "}
              {proxyStatus.running
                ? `${proxyStatus.address ?? "127.0.0.1"}:${proxyStatus.port ?? "?"}`
                : "stopped"}
            </span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border bg-background hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <SummaryCard label="Input Tokens" value={fmt(usage?.total_input_tokens)} />
        <SummaryCard label="Output Tokens" value={fmt(usage?.total_output_tokens)} />
        <SummaryCard label="Cost" value={fmtCurrency(usage?.total_cost_usd)} />
        <SummaryCard label="Requests" value={fmt(usage?.request_count)} />
        <SummaryCard label="Success Rate" value={fmtPct(usage?.success_rate)} />
        <SummaryCard label="Cache Hit Rate" value={fmtPct(usage?.cache_hit_rate)} />
        <SummaryCard label="Total Tokens" value={fmt(usage?.real_total_tokens)} />
        <SummaryCard
          label="Proxy Status"
          value={proxyStatus?.running ? "Running" : "Stopped"}
          highlight={proxyStatus?.running ? "text-green-500" : "text-red-500"}
        />
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-xl font-semibold ${highlight ?? ""}`}>{value}</div>
    </div>
  );
}

export function ConnectionError({ error }: { error: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <WifiOff className="size-12 text-muted-foreground/50 mb-4" />
      <h2 className="text-lg font-semibold mb-2">Connection Error</h2>
      <p className="text-sm text-muted-foreground max-w-md">
        Could not connect to the Hyper MITM monitor daemon at{" "}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">http://127.0.0.1:15722</code>.
      </p>
      <p className="text-xs text-muted-foreground mt-1">{error}</p>
    </div>
  );
}

export function SessionList({ sessions }: { sessions: { providerId: string; sessionId: string; sourcePath?: string; projectDir?: string; lastActiveAt?: string }[] }) {
  if (sessions.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        <MessageSquare className="size-8 mx-auto mb-2 opacity-40" />
        No sessions found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold mb-3">Recent Sessions ({sessions.length})</h2>
      {sessions.slice(0, 50).map((s, i) => (
        <div key={`${s.providerId}:${s.sessionId}:${i}`} className="rounded border bg-card p-3 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium">{s.providerId}</span>
            <span className="text-xs text-muted-foreground truncate font-mono">{s.sessionId}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {s.projectDir && (
              <span className="flex items-center gap-1 truncate">
                <FolderOpen className="size-3 shrink-0" />
                {s.projectDir}
              </span>
            )}
            {s.lastActiveAt && (
              <span className="flex items-center gap-1">
                <Clock className="size-3 shrink-0" />
                {fmtTs(s.lastActiveAt)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}