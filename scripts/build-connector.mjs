// scripts/build-connector.mjs
//
// Builds a trimmed cc-connect sidecar (claudecode + wecom only, no web UI) and
// places it under src-tauri/binaries/ with the Tauri externalBin naming
// (`cc-connect-<target-triple><ext>`), so `pnpm tauri build` bundles it.
//
// Source repo: CC_CONNECT_SRC env (default: ../cc-connect relative to this repo).
// Requires the Go toolchain on PATH. Skips gracefully (warns) if cc-connect
// source is missing so frontend-only builds still work.

import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const ccSrc = resolve(repoRoot, process.env.CC_CONNECT_SRC ?? "../cc-connect");
const outDir = resolve(repoRoot, "src-tauri", "binaries");

// Resolve the Rust host target triple (Tauri externalBin requires it as suffix).
function hostTargetTriple() {
  if (process.env.CC_CONNECT_TARGET_TRIPLE) return process.env.CC_CONNECT_TARGET_TRIPLE;
  try {
    const out = execSync("rustc -vV", { encoding: "utf8" });
    const m = out.match(/host:\s*(\S+)/);
    if (m) return m[1];
  } catch {
    /* fall through to platform default */
  }
  if (process.platform === "win32") return "x86_64-pc-windows-msvc";
  if (process.platform === "darwin")
    return process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  return "x86_64-unknown-linux-gnu";
}

const triple = hostTargetTriple();
const ext = process.platform === "win32" ? ".exe" : "";
const outFile = resolve(outDir, `cc-connect-${triple}${ext}`);

// Exclude every agent except claudecode, every platform except wecom, and the web UI.
const EXCLUDE_TAGS = [
  "no_web",
  "no_acp", "no_antigravity", "no_caveman", "no_codex", "no_copilot",
  "no_cursor", "no_devin", "no_gemini", "no_iflow", "no_kimi",
  "no_opencode", "no_pi", "no_qoder", "no_tmux",
  "no_feishu", "no_telegram", "no_discord", "no_slack", "no_dingtalk",
  "no_weixin", "no_qq", "no_qqbot", "no_line", "no_weibo", "no_max",
  "no_matrix", "no_webex", "no_wps_xiezuo",
  "goolm",
];

if (!existsSync(ccSrc)) {
  console.warn(
    `[build-connector] cc-connect source not found at ${ccSrc} — skipping sidecar build.\n` +
      `  Set CC_CONNECT_SRC to the cc-connect repo to bundle the connector.`,
  );
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

console.log(`[build-connector] building trimmed cc-connect → ${outFile}`);
execFileSync(
  "go",
  [
    "build",
    "-tags", EXCLUDE_TAGS.join(" "),
    "-ldflags", "-s -w",
    "-o", outFile,
    "./cmd/cc-connect",
  ],
  { cwd: ccSrc, stdio: "inherit" },
);
console.log(`[build-connector] done: ${outFile}`);
