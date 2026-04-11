#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { z } from "zod";

const CONNECTOR_MODE = (process.env.CONNECTOR_MODE ?? "readonly").toLowerCase();
const IS_AGENT_MODE = CONNECTOR_MODE === "agent";

const CodexParamsSchema = z.object({
  prompt: z.string().describe("The prompt to send to Codex"),
});

const TIMEOUT_MS = 120_000;

function shellEscape(str: string): string {
  return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function runCodex(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let cmd = `codex`;
    if (IS_AGENT_MODE) {
      cmd += ` --sandbox workspace-write -a never`;
    } else {
      cmd += ` --sandbox read-only -a never`;
    }
    cmd += ` -q ${shellEscape(prompt)}`;

    exec(cmd, {
      timeout: TIMEOUT_MS,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Codex error: ${stderr.trim() || error.message}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

const modeLabel = IS_AGENT_MODE ? "agent (workspace write access)" : "readonly";

const server = new Server(
  { name: "codex-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "codex_prompt",
      description:
        `Send a prompt to OpenAI Codex CLI and return the response. Mode: ${modeLabel}. Set CONNECTOR_MODE=agent for full capabilities.`,
      inputSchema: {
        type: "object" as const,
        properties: {
          prompt: { type: "string", description: "The prompt to send to Codex" },
        },
        required: ["prompt"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "codex_prompt") {
    const params = CodexParamsSchema.parse(args);

    try {
      const result = await runCodex(params.prompt);
      return {
        content: [{ type: "text" as const, text: result }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  }

  return { content: [{ type: "text" as const, text: `Unknown tool: ${name}` }], isError: true };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Codex MCP server started (mode: ${modeLabel})`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
