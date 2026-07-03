import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Minimal CSS for the monitor page (standalone, no tailwind here)
const style = document.createElement("style");
style.textContent = `
  :root {
    --bg: #ffffff;
    --fg: #1a1a2e;
    --muted: #f1f5f9;
    --muted-fg: #64748b;
    --border: #e2e8f0;
    --card: #ffffff;
    --primary: #3b82f6;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f172a;
      --fg: #e2e8f0;
      --muted: #1e293b;
      --muted-fg: #94a3b8;
      --border: #334155;
      --card: #1e293b;
      --primary: #60a5fa;
    }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--fg);
    line-height: 1.5;
  }
  code { font-family: 'JetBrains Mono', 'Fira Code', monospace; }
  .bg-background { background: var(--bg); }
  .text-foreground { color: var(--fg); }
  .text-muted-foreground { color: var(--muted-fg); }
  .bg-muted { background: var(--muted); }
  .bg-card { background: var(--card); }
  .border { border: 1px solid var(--border); }
  .rounded-lg { border-radius: 0.5rem; }
  .rounded-md { border-radius: 0.375rem; }
  .rounded { border-radius: 0.25rem; }
  .hover\\:bg-muted:hover { background: var(--muted); }
  .transition-colors { transition: background 0.15s, color 0.15s; }
  .animate-spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);