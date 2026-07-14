import React, { useState, useEffect } from "react";
import { api, SessionMeta, SessionMessage } from "../api";

const CARD: React.CSSProperties = {
  background: "#161b22",
  borderRadius: 8,
  padding: 16,
  border: "1px solid #21262d",
  overflow: "hidden",
};

function formatDate(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getRoleColor(role: string): string {
  switch (role.toLowerCase()) {
    case "assistant": return "#1f6feb";
    case "user": return "#3fb950";
    case "tool": return "#d29922";
    default: return "#8b949e";
  }
}

function MessagePartView({ part }: { part: NonNullable<SessionMessage["parts"]>[number] }) {
  const [open, setOpen] = useState(false);

  if (part.type === "text") {
    return <span style={{ whiteSpace: "pre-wrap" }}>{part.text}</span>;
  }

  if (part.type === "toolUse") {
    return (
      <div style={{ margin: "4px 0", borderRadius: 6, border: "1px solid #30363d", overflow: "hidden" }}>
        <button onClick={() => setOpen(!open)}
          style={{ width: "100%", textAlign: "left", padding: "6px 10px", background: "#0d1117", border: "none", cursor: "pointer", color: "#e1e4e8", fontSize: 12, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 8 }}>
          <span>🔧 Tool: {part.name}</span>
          <span style={{ marginLeft: "auto", color: "#8b949e" }}>{open ? "▲" : "▼"}</span>
        </button>
        {open && part.input && (
          <pre style={{ margin: 0, padding: "8px 10px", fontSize: 11, color: "#e1e4e8", background: "#0d1117", borderTop: "1px solid #30363d", whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto" }}>
            {part.input}
          </pre>
        )}
      </div>
    );
  }

  if (part.type === "toolResult") {
    return (
      <div style={{ margin: "4px 0", borderRadius: 6, border: "1px solid #2d6a4f", overflow: "hidden" }}>
        <button onClick={() => setOpen(!open)}
          style={{ width: "100%", textAlign: "left", padding: "6px 10px", background: "#0b2e1a", border: "none", cursor: "pointer", color: "#7ee787", fontSize: 12, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 8 }}>
          <span>✅ Tool Result</span>
          <span style={{ marginLeft: "auto", color: "#7ee787" }}>{open ? "▲" : "▼"}</span>
        </button>
        {open && part.content && (
          <pre style={{ margin: 0, padding: "8px 10px", fontSize: 11, color: "#e1e4e8", background: "#0d1117", borderTop: "1px solid #2d6a4f", whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto" }}>
            {part.content}
          </pre>
        )}
      </div>
    );
  }

  return null;
}

function MessageCard({ msg }: { msg: SessionMessage }) {
  const hasParts = msg.parts && msg.parts.length > 0;
  return (
    <div style={{ marginBottom: 8, padding: 10, borderRadius: 6, background: "#0d1117", border: "1px solid #21262d" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: getRoleColor(msg.role) }}>
          {msg.role}
        </span>
        {msg.ts && <span style={{ fontSize: 10, color: "#484f58" }}>{formatDate(msg.ts)}</span>}
      </div>
      {hasParts ? (
        <div style={{ fontSize: 12, lineHeight: 1.5 }}>
          {msg.parts!.map((p, i) => <MessagePartView key={i} part={p} />)}
        </div>
      ) : (
        <div style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", color: "#e1e4e8" }}>
          {msg.content}
        </div>
      )}
    </div>
  );
}

export default function Sessions() {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [selected, setSelected] = useState<SessionMeta | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.sessions().then(setSessions).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    setLoading(true);
    api.sessionMessages(selected.providerId, selected.sourcePath || "")
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, [selected]);

  const sortedSessions = [...sessions].sort((a, b) => (b.ts || 0) - (a.ts || 0));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, height: "calc(100vh - 100px)" }}>
      {/* Session list */}
      <div style={{ ...CARD, display: "flex", flexDirection: "column" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#f0f6fc", marginBottom: 12 }}>
          Sessions ({sortedSessions.length})
        </h3>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {sortedSessions.length === 0 && (
            <p style={{ fontSize: 12, color: "#484f58", textAlign: "center", padding: 20 }}>
              No sessions found
            </p>
          )}
          {sortedSessions.map((s, i) => {
            const key = `${s.providerId}:${s.sessionId}:${s.sourcePath || ""}`;
            const isSelected = selected?.sessionId === s.sessionId && selected?.providerId === s.providerId;
            return (
              <button key={key} onClick={() => setSelected(s)}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: isSelected ? "1px solid #1f6feb" : "1px solid transparent",
                  background: isSelected ? "#0d1117" : "transparent",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "#e1e4e8",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}>
                <span style={{ fontWeight: isSelected ? 600 : 400 }}>{s.title || `Session ${i + 1}`}</span>
                <span style={{ fontSize: 10, color: "#8b949e" }}>
                  {s.providerId} · {formatDate(s.ts)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Messages */}
      <div style={{ ...CARD, display: "flex", flexDirection: "column" }}>
        {!selected && (
          <div style={{ textAlign: "center", padding: 60, color: "#484f58", fontSize: 14 }}>
            Select a session to view messages
          </div>
        )}
        {selected && loading && (
          <div style={{ textAlign: "center", padding: 40, color: "#8b949e" }}>
            Loading messages...
          </div>
        )}
        {selected && !loading && (
          <>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#f0f6fc", marginBottom: 12 }}>
              {selected.title || "Session Messages"}
            </h3>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {messages.length === 0 && (
                <p style={{ color: "#8b949e", fontSize: 12, textAlign: "center", padding: 20 }}>
                  No messages in this session
                </p>
              )}
              {messages.map((msg, i) => (
                <MessageCard key={i} msg={msg} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}