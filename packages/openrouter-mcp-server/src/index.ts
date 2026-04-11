#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import OpenAI from "openai";
import { config } from "dotenv";
import { z } from "zod";

config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  console.error("OPENROUTER_API_KEY environment variable is required");
  process.exit(1);
}

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://github.com/model-connectors",
    "X-Title": "Model Connectors MCP",
  },
});

const ChatParamsSchema = z.object({
  model: z.string().describe("OpenRouter model ID, e.g. 'anthropic/claude-sonnet-4'"),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      })
    )
    .describe("Chat messages in OpenAI format"),
  system: z.string().optional().describe("System prompt (prepended to messages)"),
  temperature: z.number().min(0).max(2).optional().describe("Sampling temperature"),
  max_tokens: z.number().positive().optional().describe("Max tokens to generate"),
});

const ModelsParamsSchema = z.object({
  query: z.string().optional().describe("Filter models by name or ID substring"),
  max_results: z.number().positive().optional().default(20).describe("Max results to return"),
});

const server = new Server(
  { name: "openrouter-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "openrouter_chat",
      description:
        "Send a chat completion request to any model on OpenRouter (300+ models). Returns the model's response text.",
      inputSchema: {
        type: "object" as const,
        properties: {
          model: { type: "string", description: "OpenRouter model ID, e.g. 'anthropic/claude-sonnet-4'" },
          messages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                role: { type: "string", enum: ["user", "assistant", "system"] },
                content: { type: "string" },
              },
              required: ["role", "content"],
            },
            description: "Chat messages in OpenAI format",
          },
          system: { type: "string", description: "System prompt (prepended to messages)" },
          temperature: { type: "number", description: "Sampling temperature (0-2)" },
          max_tokens: { type: "number", description: "Max tokens to generate" },
        },
        required: ["model", "messages"],
      },
    },
    {
      name: "openrouter_models",
      description: "List available models on OpenRouter, optionally filtered by name/ID.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "Filter models by name or ID substring" },
          max_results: { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "openrouter_chat") {
    const params = ChatParamsSchema.parse(args);
    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (params.system) {
      messages.push({ role: "system", content: params.system });
    }
    messages.push(
      ...params.messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }))
    );

    const completion = await openai.chat.completions.create({
      model: params.model,
      messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.max_tokens ?? 4096,
    });

    const text = completion.choices[0]?.message?.content ?? "(no response)";
    const usage = completion.usage;

    return {
      content: [
        {
          type: "text" as const,
          text: `${text}\n\n---\nModel: ${completion.model}\nTokens: ${usage?.prompt_tokens ?? "?"} in / ${usage?.completion_tokens ?? "?"} out`,
        },
      ],
    };
  }

  if (name === "openrouter_models") {
    const params = ModelsParamsSchema.parse(args ?? {});

    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` },
    });
    const data = (await response.json()) as {
      data: Array<{
        id: string;
        name: string;
        context_length: number;
        pricing: { prompt: string; completion: string };
      }>;
    };

    let models = data.data;
    if (params.query) {
      const q = params.query.toLowerCase();
      models = models.filter(
        (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
      );
    }
    models = models.slice(0, params.max_results);

    const text = models
      .map(
        (m) =>
          `${m.id} — ${m.name} (ctx: ${m.context_length}, cost: $${m.pricing.prompt}/$${m.pricing.completion} per token)`
      )
      .join("\n");

    return {
      content: [{ type: "text" as const, text: text || "No models found matching query." }],
    };
  }

  return { content: [{ type: "text" as const, text: `Unknown tool: ${name}` }], isError: true };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
