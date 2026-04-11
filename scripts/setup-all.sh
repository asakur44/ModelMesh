#!/usr/bin/env bash
# One-shot setup: build servers and register in all CLIs
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "=== Installing dependencies ==="
npm install

echo ""
echo "=== Building MCP servers ==="
npm run build

echo ""
echo "=== Claude Code ==="
echo "  .mcp.json already in project root — Claude Code will auto-detect it."

echo ""
echo "=== Codex CLI ==="
bash "$SCRIPT_DIR/codex-setup.sh"

echo ""
echo "=== Gemini CLI ==="
bash "$SCRIPT_DIR/gemini-setup.sh"

echo ""
echo "=== Setup complete ==="
echo "Make sure OPENROUTER_API_KEY is set in your environment or .env file."
