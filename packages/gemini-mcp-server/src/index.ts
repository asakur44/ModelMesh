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

const GeminiParamsSchema = z.object({
  prompt: z.string().describe("The prompt to send to Gemini"),
  model: z.string().optional().describe("Gemini model to use (e.g. 'pro', 'flash')"),
});

const TIMEOUT_MS = 600_000; // 10 minutes — agent tasks can take a while

function shellEscape(str: string): string {
  return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function runGemini(prompt: string, model?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let cmd = `gemini`;
    if (model) {
      cmd += ` -m ${shellEscape(model)}`;
    }
    if (!IS_AGENT_MODE) {
      cmd += ` --approval-mode plan`;
    } else {
      cmd += ` --approval-mode yolo`;
    }
    cmd += ` -p ${shellEscape(prompt)}`;

    const proc = exec(cmd, {
      timeout: TIMEOUT_MS,
      killSignal: "SIGTERM",
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        if (error.killed) {
          reject(new Error(
            `[GEMINI TIMEOUT] Process killed after ${TIMEOUT_MS / 1000}s. ` +
            `The task was too long for the current timeout. ` +
            `Partial output:\n${stdout.trim().slice(-500) || "(none)"}`
          ));
        } else if (error.signal) {
          reject(new Error(
            `[GEMINI CRASHED] Process terminated by signal ${error.signal}. ` +
            `stderr: ${stderr.trim().slice(-500) || "(none)"}`
          ));
        } else {
          reject(new Error(
            `[GEMINI ERROR] Exit code ${error.code}. ` +
            `${stderr.trim().slice(-500) || error.message}`
          ));
        }
      } else {
        resolve(stdout.trim());
      }
    });

    proc.on("error", (err) => {
      reject(new Error(
        `[GEMINI SPAWN FAILED] Could not start gemini: ${err.message}`
      ));
    });
  });
}

const modeLabel = IS_AGENT_MODE ? "agent (full write access)" : "readonly";

const server = new Server(
  { name: "gemini-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "gemini_prompt",
      description:
        `Send a prompt to Google Gemini CLI and return the response. Mode: ${modeLabel}. Set CONNECTOR_MODE=agent for full capabilities.`,
      inputSchema: {
        type: "object" as const,
        properties: {
          prompt: { type: "string", description: "The prompt to send to Gemini" },
          model: {
            type: "string",
            description: "Gemini model to use (e.g. 'pro', 'flash'). Defaults to CLI default.",
          },
        },
        required: ["prompt"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "gemini_prompt") {
    const params = GeminiParamsSchema.parse(args);

    try {
      const result = await runGemini(params.prompt, params.model);
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
  console.error(`Gemini MCP server started (mode: ${modeLabel})`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
