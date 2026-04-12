#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { z } from "zod";
import { createInterface } from "readline";

const CONNECTOR_MODE = (process.env.CONNECTOR_MODE ?? "readonly").toLowerCase();
const IS_AGENT_MODE = CONNECTOR_MODE === "agent";

const CodexParamsSchema = z.object({
  prompt: z.string().describe("The prompt to send to Codex"),
});

const TIMEOUT_MS = 600_000; // 10 minutes — agent tasks can take a while

function shellEscape(str: string): string {
  if (process.platform === "win32") {
    return '"' + str.replace(/"/g, '\\"') + '"';
  }
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

function runCodex(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let cmd = `codex exec --json`;
    if (IS_AGENT_MODE) {
      cmd += ` --sandbox workspace-write`;
    } else {
      cmd += ` --sandbox read-only`;
    }
    cmd += ` ${shellEscape(prompt)}`;

    const proc = exec(cmd, {
      timeout: TIMEOUT_MS,
      killSignal: "SIGTERM",
      windowsHide: true,
    });

    // Close stdin so codex doesn't wait for additional input
    proc.stdin?.end();

    let stderr = "";
    const messages: string[] = [];
    let settled = false;

    proc.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });

    // Parse JSONL stream — collect agent messages and resolve on turn.completed
    const rl = createInterface({ input: proc.stdout! });
    rl.on("line", (line) => {
      try {
        const event = JSON.parse(line);
        if (event.type === "item.completed" && event.item?.text) {
          messages.push(event.item.text);
        }
        if (event.type === "turn.completed") {
          settled = true;
          rl.close();
          proc.kill();
          resolve(messages.join("\n") || "(no output)");
        }
      } catch {
        // ignore non-JSON lines
      }
    });

    proc.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      if (signal || (proc.killed && code !== 0)) {
        reject(new Error(
          `[CODEX TIMEOUT] Process killed after ${TIMEOUT_MS / 1000}s. ` +
          `Partial output:\n${messages.join("\n").slice(-500) || "(none)"}`
        ));
      } else if (code !== 0) {
        reject(new Error(
          `[CODEX ERROR] Exit code ${code}. ` +
          `${stderr.trim().slice(-500) || "(no stderr)"}`
        ));
      } else {
        resolve(messages.join("\n") || "(no output)");
      }
    });

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(new Error(
        `[CODEX SPAWN FAILED] Could not start codex: ${err.message}`
      ));
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
