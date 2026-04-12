## Model Connectors — MCP Server Suite

This project contains MCP servers that are registered globally in ~/.claude.json.
The compiled servers in dist/ are what actually runs — source changes require `npm run build`.

**IMPORTANT**: Do NOT modify, rebuild, or "fix" the MCP server source code unless the user explicitly asks you to work on the Model Connectors project. These servers are tools for other projects to use, not something to debug mid-session.

If an MCP tool returns an error (e.g. [CODEX TIMEOUT], [GEMINI CRASHED]):
- Report the error to the user
- Do NOT attempt to edit the server source code
- Suggest the user retry, use a different model, or check their CLI installation
