import React, { useState, useEffect, useCallback } from "react";
import {
  api,
  UsageSummary,
  UsageSummaryByApp,
  DailyStats,
  ProviderStats,
  ModelStats,
} from "../api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend, Cell } from "recharts";

const LABEL_STYLE: React.CSSProperties = { fontSize: 11, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.5px" };
const VALUE_STYLE: React.CSSProperties = { fontSize: 22, fontWeight: 700, color: "#f0f6fc" };
const CARD: React.CSSProperties = { background: "#161b22", borderRadius: 8, padding: 16, border: "1px solid #21262d" };

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(s: string): string {
  const n = parseFloat(s);
  return isNaN(n) ? s : `$${n.toFixed(4)}`;
}

function toNumber(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export default function Dashboard() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [byApp, setByApp] = useState<UsageSummaryByApp[]>([]);
  const [trends, setTrends] = useState<DailyStats[]>([]);
  const [providerStats, setProviderStats] = useState<ProviderStats[]>([]);
  const [modelStats, setModelStats] = useState<ModelStats[]>([]);
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");

  const rangeTs = useCallback((r: string): [number, number] => {
    const now = Date.now() / 1000;
    switch (r) {
      case "24h": return [now - 86400, now];
      case "7d": return [now - 7 * 86400, now];
      case "30d": return [now - 30 * 86400, now];
      default: return [now - 7 * 86400, now];
    }
  }, []);

  useEffect(() => {
    const [start, end] = rangeTs(range);
    const p = { startDate: Math.floor(start), endDate: Math.floor(end) };
    api.usageSummary(p).then(setSummary).catch(() => {});
    api.usageByApp(p).then(setByApp).catch(() => {});
    api.dailyTrends(p).then(setTrends).catch(() => {});
    api.providerStats(p).then(setProviderStats).catch(() => {});
    api.modelStats(p).then(setModelStats).catch(() => {});
  }, [range, rangeTs]);

  const COLORS = ["#1f6feb", "#3fb950", "#d29922", "#f85149", "#bc8cff", "#79c0ff", "#ff7b72", "#7ee787"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Time range selector */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {(["24h", "7d", "30d"] as const).map((r) => (
          <button key={r} onClick={() => setRange(r)}
            style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #30363d", cursor: "pointer", fontSize: 12, background: range === r ? "#1f6feb" : "transparent", color: range === r ? "#fff" : "#8b949e" }}>
            {r}
          </button>
        ))}
      </div>

      {/* Hero summary cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
          <div style={CARD}><div style={LABEL_STYLE}>Total Requests</div><div style={VALUE_STYLE}>{summary.totalRequests}</div></div>
          <div style={CARD}><div style={LABEL_STYLE}>Total Cost</div><div style={{ ...VALUE_STYLE, color: "#d29922" }}>{formatCost(summary.totalCost)}</div></div>
          <div style={CARD}><div style={LABEL_STYLE}>Input Tokens</div><div style={VALUE_STYLE}>{formatTokens(summary.totalInputTokens)}</div></div>
          <div style={CARD}><div style={LABEL_STYLE}>Output Tokens</div><div style={VALUE_STYLE}>{formatTokens(summary.totalOutputTokens)}</div></div>
          <div style={CARD}><div style={LABEL_STYLE}>Cache Hit Rate</div><div style={{ ...VALUE_STYLE, color: "#3fb950" }}>{(summary.cacheHitRate * 100).toFixed(1)}%</div></div>
          <div style={CARD}><div style={LABEL_STYLE}>Success Rate</div><div style={{ ...VALUE_STYLE, color: summary.successRate > 0.95 ? "#3fb950" : "#d29922" }}>{(summary.successRate * 100).toFixed(1)}%</div></div>
        </div>
      )}

      {/* Usage by App */}
      {byApp.length > 0 && (
        <div style={CARD}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#f0f6fc", marginBottom: 12 }}>Usage by Application</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {byApp.map((app, i) => (
              <div key={app.appType} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS[i % COLORS.length] }} />
                <span style={{ fontSize: 13, color: "#e1e4e8", flex: 1 }}>{app.appType}</span>
                <span style={{ fontSize: 12, color: "#8b949e" }}>{formatTokens(app.summary.realTotalTokens)} tokens</span>
                <span style={{ fontSize: 12, color: "#d29922", width: 80, textAlign: "right" }}>{formatCost(app.summary.totalCost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily Trends Chart */}
      {trends.length > 1 && (
        <div style={CARD}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#f0f6fc", marginBottom: 12 }}>Daily Trends</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#8b949e" }} />
              <YAxis tick={{ fontSize: 11, fill: "#8b949e" }} />
              <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 6, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="requestCount" stroke="#1f6feb" name="Requests" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="totalTokens" stroke="#3fb950" name="Tokens" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Provider Stats */}
      {providerStats.length > 0 && (
        <div style={CARD}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#f0f6fc", marginBottom: 12 }}>Provider Stats</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={providerStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis dataKey="providerName" tick={{ fontSize: 11, fill: "#8b949e" }} />
              <YAxis tick={{ fontSize: 11, fill: "#8b949e" }} />
              <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 6, fontSize: 12 }} />
              <Bar dataKey="requestCount" name="Requests" radius={[4, 4, 0, 0]}>
                {providerStats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Model Stats */}
      {modelStats.length > 0 && (
        <div style={CARD}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#f0f6fc", marginBottom: 12 }}>Model Usage</h3>
          <div style={{ display: "grid", gap: 4 }}>
            {modelStats.map((m) => (
              <div key={m.model} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 8px", borderRadius: 6, background: "#0d1117" }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#e1e4e8", flex: 1 }}>{m.model}</span>
                <span style={{ fontSize: 12, color: "#8b949e" }}>{m.requestCount} req</span>
                <span style={{ fontSize: 12, color: "#8b949e" }}>{formatTokens(m.totalTokens)} tok</span>
                <span style={{ fontSize: 12, color: "#d29922", width: 80, textAlign: "right" }}>{formatCost(m.totalCost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!summary && trends.length === 0 && providerStats.length === 0 && (
        <div style={{ ...CARD, textAlign: "center", padding: 60 }}>
          <p style={{ color: "#8b949e", fontSize: 14 }}>No usage data yet. Start using Hyper MITM to see statistics here.</p>
        </div>
      )}
    </div>
  );
}
