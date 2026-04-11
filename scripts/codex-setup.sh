#!/usr/bin/env bash
# Register MCP servers in Codex CLI
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Registering MCP servers in Codex CLI..."

# OpenRouter
codex mcp add openrouter -- node "$PROJECT_DIR/packages/openrouter-mcp-server/dist/index.js"
echo "  ✓ openrouter"

# Claude Code (built-in MCP server mode)
codex mcp add claude-code -- claude mcp serve
echo "  ✓ claude-code"

# Gemini
codex mcp add gemini -- node "$PROJECT_DIR/packages/gemini-mcp-server/dist/index.js"
echo "  ✓ gemini"

echo "Done. Run 'codex mcp list' to verify."
