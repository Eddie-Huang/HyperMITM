import React, { useState, useEffect } from "react";
import { api, MonitorStatus } from "./api";
import Dashboard from "./pages/Dashboard";
import Sessions from "./pages/Sessions";

type Tab = "dashboard" | "sessions";

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [status, setStatus] = useState<MonitorStatus | null>(null);

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus({ status: "unknown", version: "?" }));
  }, []);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 20px" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid #21262d" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f0f6fc" }}>
          Hyper MITM Monitor
        </h1>
        {status && (
          <span style={{ fontSize: 12, color: status.status === "running" ? "#3fb950" : "#f85149", background: status.status === "running" ? "#0b2e1a" : "#2d0f12", padding: "2px 8px", borderRadius: 999 }}>
            ● {status.status} v{status.version}
          </span>
        )}
        <nav style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {(["dashboard", "sessions"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: tab === t ? 600 : 400,
                background: tab === t ? "#1f6feb" : "transparent",
                color: tab === t ? "#fff" : "#8b949e",
              }}
            >
              {t === "dashboard" ? "📊 Dashboard" : "💬 Sessions"}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {tab === "dashboard" ? <Dashboard /> : <Sessions />}
      </main>
    </div>
  );
}
