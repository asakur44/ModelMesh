# Model Connectors

Bidirectional MCP servers connecting **Claude Code**, **OpenRouter**, **OpenAI Codex CLI**, and **Google Gemini CLI**. Any tool can invoke any other as an MCP tool.

## Integration Matrix

| Caller | OpenRouter | Claude Code | Codex | Gemini |
|--------|-----------|-------------|-------|--------|
| **Claude Code** | custom MCP | — | custom MCP | custom MCP |
| **Codex** | custom MCP | built-in | — | custom MCP |
| **Gemini** | custom MCP | built-in | custom MCP | — |

- **Custom MCP**: servers built in this repo
- **Built-in**: `claude mcp serve` (first-party MCP mode)

## Prerequisites

- Node.js 18+
- [Claude Code](https://claude.ai/code) installed and authenticated
- [OpenAI Codex CLI](https://www.npmjs.com/package/@openai/codex) installed and authenticated
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) installed and authenticated
- [OpenRouter API key](https://openrouter.ai/keys)

## Quick Setup

```bash
# 1. Clone and enter the project
cd "Model Connectors"

# 2. Set your OpenRouter API key
cp .env.example .env
# Edit .env with your key

# 3. Run the setup script (installs, builds, registers)
bash scripts/setup-all.sh
```

## Access Modes

Codex and Gemini servers support two modes controlled by the `CONNECTOR_MODE` environment variable:

| Mode | Value | Codex | Gemini |
|------|-------|-------|--------|
| **Read-only** (default) | `readonly` | `--sandbox read-only` | `--approval-mode plan` |
| **Full agent** | `agent` | `--sandbox workspace-write` | `--approval-mode yolo` |

### Switch modes

```bash
# Set in your shell profile for all sessions:
export CONNECTOR_MODE=agent    # full write access
export CONNECTOR_MODE=readonly # read-only (default)

# Or per-server in Claude Code's MCP env config
```

OpenRouter is always API-only — no file system access regardless of mode.

## Manual Setup

### Build

```bash
npm install
npm run build
```

### Register in Claude Code

The `.mcp.json` in the project root is auto-detected by Claude Code when you run it from this directory.

### Register in Codex CLI

```bash
bash scripts/codex-setup.sh
```

### Register in Gemini CLI

```bash
bash scripts/gemini-setup.sh
```

## MCP Tools

### openrouter_chat

Send a prompt to any of 300+ models on OpenRouter.

```
model: "anthropic/claude-sonnet-4"
messages: [{"role": "user", "content": "Hello!"}]
system: "You are helpful."  (optional)
temperature: 0.7              (optional)
max_tokens: 4096              (optional)
```

### openrouter_models

List/search available models on OpenRouter.

```
query: "claude"    (optional filter)
max_results: 20    (optional)
```

### codex_prompt

Send a prompt to Codex CLI.

```
prompt: "Explain this function"
```

### gemini_prompt

Send a prompt to Gemini CLI.

```
prompt: "Explain quantum computing"
model: "pro"    (optional, defaults to CLI default)
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENROUTER_API_KEY` | Yes | — | Your OpenRouter API key |
| `CONNECTOR_MODE` | No | `readonly` | `readonly` or `agent` — controls file access for Codex and Gemini |

## Project Structure

```
├── packages/
│   ├── openrouter-mcp-server/   # OpenRouter API MCP server
│   ├── codex-mcp-server/        # Codex CLI wrapper MCP server
│   └── gemini-mcp-server/       # Gemini CLI wrapper MCP server
├── scripts/                     # Setup and registration scripts
├── .mcp.json                    # Claude Code MCP config
└── .env.example                 # API key template
```
