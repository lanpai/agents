import "bun";
import Anthropic from "@anthropic-ai/sdk";

// which model serves agent decisions; the frontend always speaks Anthropic
// shapes — non-sonnet paths translate to/from OpenAI-compatible APIs
const BACKEND = "deepseek" as "sonnet" | "k3" | "deepseek";

type OpenAICompatibleConfig = {
  label: string; // error-message prefix
  url: string;
  model: string;
  apiKeyEnv: string;
  timeoutMs: number;
  // reasoning models count thinking tokens against the completion budget
  maxTokensMultiplier: number;
  extraBody?: Record<string, unknown>;
};

const KIMI: OpenAICompatibleConfig = {
  label: "kimi",
  url: "https://api.moonshot.ai/v1/chat/completions",
  model: "kimi-k3",
  apiKeyEnv: "KIMI_API_KEY",
  timeoutMs: 30000, // k3 always reasons, so give it more room
  maxTokensMultiplier: 8,
};

const DEEPSEEK: OpenAICompatibleConfig = {
  label: "deepseek",
  url: "https://api.deepseek.com/v1/chat/completions",
  model: "deepseek-v4-pro",
  apiKeyEnv: "DEEPSEEK_API_KEY",
  timeoutMs: 15000,
  maxTokensMultiplier: 1,
  // v4 thinks by default; decisions should be fast and cheap like the
  // sonnet path, which also runs with thinking disabled
  extraBody: { thinking: { type: "disabled" } },
};

// phoneme transcription is mechanical and latency-sensitive (it gates every
// spoken line), so it always runs on the fast model regardless of BACKEND
const DEEPSEEK_FLASH: OpenAICompatibleConfig = {
  label: "deepseek-flash",
  url: "https://api.deepseek.com/v1/chat/completions",
  model: "deepseek-v4-flash",
  apiKeyEnv: "DEEPSEEK_API_KEY",
  timeoutMs: 15000,
  maxTokensMultiplier: 1,
  extraBody: { thinking: { type: "disabled" } },
};

// fail fast: a hung upstream request would otherwise pin a frontend decision
// slot for the SDK default of 10 minutes
const client = new Anthropic({ timeout: 15000, maxRetries: 1 });

type AgentRequest = {
  system: string;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  tool_choice?: Anthropic.ToolChoice;
  max_tokens?: number;
};

async function callSonnet(body: AgentRequest): Promise<Response> {
  try {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: Math.min(body.max_tokens ?? 300, 1000),
      system: body.system,
      messages: body.messages,
      tools: body.tools,
      tool_choice: body.tool_choice ?? { type: "any" },
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
    });
    return Response.json(message);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "rate limited" }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      return Response.json(
        { error: error.message },
        { status: error.status ?? 500 },
      );
    }
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

// OpenAI-compatible response message shape
type OpenAIToolCall = {
  id: string;
  function: { name: string; arguments: string };
};

async function callOpenAICompatible(
  config: OpenAICompatibleConfig,
  body: AgentRequest,
): Promise<Response> {
  const apiKey = Bun.env[config.apiKeyEnv];
  if (!apiKey) {
    return Response.json(
      { error: `${config.apiKeyEnv} not set` },
      { status: 500 },
    );
  }

  // Anthropic tool_choice -> OpenAI-compatible tool_choice
  const toolChoice = body.tool_choice ?? { type: "any" };
  const openAIToolChoice =
    toolChoice.type === "tool"
      ? { type: "function", function: { name: toolChoice.name } }
      : toolChoice.type === "any"
        ? "required"
        : "auto";

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(config.timeoutMs),
      body: JSON.stringify({
        model: config.model,
        // the system prompt rides as the first message in OpenAI format
        messages: [{ role: "system", content: body.system }, ...body.messages],
        tools: body.tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
          },
        })),
        tool_choice: openAIToolChoice,
        max_completion_tokens:
          Math.min(body.max_tokens ?? 300, 1000) * config.maxTokensMultiplier,
        ...config.extraBody,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return Response.json(
        {
          error: `${config.label} ${response.status}: ${detail.slice(0, 500)}`,
        },
        { status: response.status },
      );
    }

    const completion = (await response.json()) as {
      choices?: {
        message?: { content?: string | null; tool_calls?: OpenAIToolCall[] };
        finish_reason?: string;
      }[];
    };
    const message = completion.choices?.[0]?.message;

    // translate back into the Anthropic Message shape the frontend expects
    const content: unknown[] = [];
    if (message?.content) {
      content.push({ type: "text", text: message.content });
    }
    for (const toolCall of message?.tool_calls ?? []) {
      let input: unknown = {};
      try {
        input = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        // malformed arguments: surface the call with empty input
      }
      content.push({
        type: "tool_use",
        id: toolCall.id,
        name: toolCall.function.name,
        input,
      });
    }
    return Response.json({
      model: config.model,
      role: "assistant",
      content,
      stop_reason:
        (message?.tool_calls?.length ?? 0) > 0 ? "tool_use" : "end_turn",
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

Bun.serve({
  port: 3001,
  routes: {
    "/api/agent": {
      POST: async (req) => {
        const body = (await req.json()) as AgentRequest;
        if (BACKEND === "k3") return callOpenAICompatible(KIMI, body);
        if (BACKEND === "deepseek") return callOpenAICompatible(DEEPSEEK, body);
        return callSonnet(body);
      },
    },
    "/api/transcribe": {
      POST: async (req) => {
        const body = (await req.json()) as AgentRequest;
        return callOpenAICompatible(DEEPSEEK_FLASH, body);
      },
    },
  },
});

console.log(
  `agent API listening on http://localhost:3001 (backend: ${BACKEND})`,
);
