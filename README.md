<div align="center">

# Hyper MITM

### All-in-One Assistant for Claude Code, Codex & Gemini CLI, with native headroom context compression

[![Version](https://img.shields.io/github/v/release/Eddie-Huang/HyperMITM?color=blue&label=version)](https://github.com/Eddie-Huang/HyperMITM/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/Eddie-Huang/HyperMITM/releases)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-orange.svg)](https://tauri.app/)
[![Downloads](https://img.shields.io/github/downloads/Eddie-Huang/HyperMITM/total)](https://github.com/Eddie-Huang/HyperMITM/releases/latest)
[![Fork](https://img.shields.io/badge/forked%20from-cc%20switch-blue.svg)](https://github.com/farion1231/cc-switch)

### 🌐 Official Repository: **[github.com/Eddie-Huang/HyperMITM](https://github.com/Eddie-Huang/HyperMITM)**

English | [中文](README_ZH.md) | [Changelog](CHANGELOG.md)

</div>

---

## About Hyper MITM

**Hyper MITM** is a fork of [cc-switch](https://github.com/farion1231/cc-switch) with enhanced features for power users:

- 🚀 **Native Headroom Integration** — Built-in context compression via headroom, reducing token usage by 60-90%
- 🔄 **WeCom Connector** — Enterprise WeChat Work integration for team collaboration
- 📊 **Web Monitor Dashboard** — Browser-accessible monitoring for usage stats and session management
- 🎯 **All cc-switch Features** — Full provider management, MCP sync, proxy & failover, and more

## Why Hyper MITM?

Modern AI-powered coding relies on tools like Claude Code, Codex, and Gemini CLI — but each has its own configuration format. Switching API providers means manually editing JSON, TOML, or `.env` files.

**Hyper MITM** gives you a single desktop app to manage all supported AI tools, with the added power of native context compression and enterprise features:

- **One App, Multiple Tools** — Manage Claude Code, Codex, Gemini CLI, and more from a single interface
- **No More Manual Editing** — 50+ provider presets; just pick and switch
- **Native Headroom Support** — Automatic context compression for supported models
- **Unified MCP & Skills Management** — One panel to manage MCP servers and Skills across apps
- **Web Monitor** — Browser-accessible dashboard for usage tracking
- **Cross-Platform** — Native desktop app for Windows, macOS, and Linux, built with Tauri 2

## Key Features

### Core Features (from cc-switch)

- **Provider Management** — 7 supported tools, 50+ presets, one-click switching
- **Proxy & Failover** — Local proxy with hot-switching, auto-failover, circuit breaker
- **MCP, Prompts & Skills** — Unified management with bidirectional sync
- **Usage & Cost Tracking** — Dashboard with trend charts and custom pricing
- **Session Manager** — Browse, search, and restore conversation history

### Hyper MITM Exclusive

| Feature | Description |
|---------|-------------|
| **Headroom Integration** | Native context compression — reduce token usage by 60-90% |
| **WeCom Connector** | Enterprise WeChat Work bridge for team workflows |
| **Web Monitor** | Browser-accessible usage dashboard (127.0.0.1:15722) |

## Screenshots

| Main Interface | Provider Management |
|:--------------:|:-------------------:|
| ![Main Interface](assets/screenshots/main-en.png) | ![Add Provider](assets/screenshots/add-en.png) |

## Quick Start

### 1. Add Provider

Click "Add Provider" → Choose a preset or create custom configuration

### 2. Switch Provider

- **Main UI**: Select provider → Click "Enable"
- **System Tray**: Click provider name directly (instant effect)

### 3. Headroom (Optional)

Enable headroom in Settings for automatic context compression

### 4. Web Monitor

Access `http://127.0.0.1:15722` in your browser for usage monitoring

## Download & Installation

### System Requirements

- **Windows**: Windows 10 and above
- **macOS**: macOS 12 (Monterey) and above
- **Linux**: Ubuntu 22.04+ / Debian 11+ / Fedora 34+

### Download

Download the latest release from the [Releases](https://github.com/Eddie-Huang/HyperMITM/releases) page:

- **Windows**: `.msi` installer or portable `.zip`
- **macOS**: `.dmg` (recommended) or `.zip`
- **Linux**: `.deb`, `.rpm`, or `.AppImage`

### macOS via Homebrew

```bash
# Add tap (if available)
brew install --cask hyper-mitm
```

## Development

### Environment Requirements

- Node.js 18+
- pnpm 8+
- Rust 1.85+
- Tauri CLI 2.8+

### Development Commands

```bash
# Install dependencies
pnpm install

# Dev mode (hot reload)
pnpm dev

# Type check
pnpm typecheck

# Build
pnpm build

# Run tests
pnpm test:unit
```

### Rust Backend

```bash
cd src-tauri

# Format
cargo fmt

# Check
cargo clippy

# Test
cargo test
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React + TS)                    │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ Components  │  │    Hooks     │  │  TanStack Query  │    │
│  │   (UI)      │──│ (Bus. Logic) │──│   (Cache/Sync)   │    │
│  └─────────────┘  └──────────────┘  └──────────────────┘    │
└────────────────────────┬────────────────────────────────────┘
                         │ Tauri IPC
┌────────────────────────▼────────────────────────────────────┐
│                  Backend (Tauri + Rust)                     │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │  Commands   │  │   Services   │  │  Models/Config   │    │
│  │ (API Layer) │──│ (Bus. Layer) │──│     (Data)       │    │
│  └─────────────┘  └──────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
├── src/                        # Frontend (React + TypeScript)
│   ├── components/             # UI components
│   ├── hooks/                  # Custom hooks
│   ├── lib/                    # Utilities
│   └── types/                  # TypeScript definitions
├── src-tauri/                  # Backend (Rust)
│   └── src/
│       ├── commands/           # Tauri IPC commands
│       ├── services/           # Business logic
│       ├── proxy/              # MITM proxy
│       └── monitor/            # Web monitor server
├── monitor-spa/                # Standalone monitor frontend
└── cc-connect/                 # WeCom connector
```

## Credits

Hyper MITM is a fork of [cc-switch](https://github.com/farion1231/cc-switch) by [farion1231](https://github.com/farion1231).

### Upstream Features

- Provider management for Claude Code, Codex, Gemini CLI, OpenCode, OpenClaw, Hermes
- MCP server management with bidirectional sync
- Local proxy with failover
- Usage tracking and session management

### Hyper MITM Additions

- Native headroom context compression
- WeCom (WeChat Work) connector
- Web monitor dashboard
- Enhanced enterprise features

## License

MIT © Jason Young (upstream) | Hyper MITM additions MIT © Eddie Huang

---

<div align="center">

**[⬆ Back to Top](#hyper-mitm)**

</div>
