#!/usr/bin/env bash
# Register MCP servers in Gemini CLI
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Registering MCP servers in Gemini CLI..."

# OpenRouter
gemini mcp add -s user openrouter node "$PROJECT_DIR/packages/openrouter-mcp-server/dist/index.js"
echo "  ✓ openrouter"

# Claude Code (built-in MCP server mode)
gemini mcp add -s user claude-code claude mcp serve
echo "  ✓ claude-code"

# Codex (built-in MCP server mode)
gemini mcp add -s user codex codex mcp-server
echo "  ✓ codex"

echo "Done. Verify in ~/.gemini/settings.json"
