---
name: context-window-bridge-fix
description: Fix where bridge/cc-connect was hardcoded to 200k context window instead of respecting provider-reported value
metadata:
  type: project
---

**Problem:** When using cc-connect (WeCom bridge) to connect Claude Code, the `--max-context-tokens` flag was never passed to the Claude Code CLI. The `claudeContextWindow()` function in cc-connect's session.go had a hardcoded fallback of 200k tokens regardless of the actual provider model's context window. For glm-5.2 (1M context), this meant Claude Code truncated its context at 200k, losing the last ~800k tokens of conversation history.

**Root cause (3 layers):**
1. **HyperMITM → cc-connect config**: `write_config_toml()` in `commands/connector.rs` never wrote `max_context_tokens` into the cc-connect `config.toml`
2. **cc-connect → Claude Code CLI**: Even if config had `max_context_tokens`, the session struct in `session.go` didn't store it and pass it as `--max-context-tokens`
3. **Footer display**: `claudeContextWindow()` had no access to the configured value and fell back to 200k for all non-`[1m]` models

**Fix applied:**
- `src-tauri/src/proxy/types.rs`: Added `context_window: u64` field to `ConnectorProject`
- `src-tauri/src/commands/connector.rs`: Added `extract_context_window_from_provider()` that reads from provider's `settings_config["context_window"]` with model-name-based fallbacks (glm-5/opus/fable = 1M, sonnet = 200k). In `enable_connector()`, reads the current Claude provider and injects `context_window` into each project. `write_config_toml()` writes `max_context_tokens = N` when > 0.
- `cc-connect/agent/claudecode/session.go`: Added `maxContextTokens` field to `claudeSession` struct, stored during construction. `claudeContextWindow()` now accepts `maxContextTokens` param — if > 0, it takes precedence over the hardcoded model-name heuristic.
- `src/lib/api/connector.ts`: Added `contextWindow?: number` to `ConnectorProject` interface.

**Why:** When the session used ~221k tokens (well within glm-5.2's 1M window), Claude Code was truncating at 200k because `--max-context-tokens` wasn't set. The conversation quality degraded as older context was silently evicted.

**Related memories:** [[hypermitm-project]], [[hypermitm-complete-codebase-understanding]]