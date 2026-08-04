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

// small utility calls (phoneme transcription, speech warping) are mechanical
// and latency-sensitive, so they always run on the fast model regardless of
// BACKEND
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

// ---- audience voting -------------------------------------------------
// viewers open /vote.html, pick a display name, and guess who the killer
// is. The game screen announces the round (cast + killer) and the moment
// the killer goes for the kill. A correct guess earns up to MAX_POINTS,
// decaying linearly from round start to the kill — so early (and unchanged)
// votes are worth more. State lives in memory: a server restart wipes it.

const MAX_POINTS = 1000;

type VoteRound = {
  cast: string[];
  killer: string;
  startAt: number;
  endedAt: number | null;
  // keyed by the viewer's chosen display name; `at` re-stamps on change
  votes: Map<string, { pick: string; at: number }>;
};

let round: VoteRound | null = null;

function voteResults(current: VoteRound, endedAt: number) {
  const span = Math.max(1, endedAt - current.startAt);
  return [...current.votes.entries()]
    .map(([user, vote]) => ({
      user,
      pick: vote.pick,
      points:
        vote.pick === current.killer
          ? Math.max(0, Math.round((MAX_POINTS * (endedAt - vote.at)) / span))
          : 0,
    }))
    .sort((a, b) => b.points - a.points);
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
    "/api/flash": {
      POST: async (req) => {
        const body = (await req.json()) as AgentRequest;
        return callOpenAICompatible(DEEPSEEK_FLASH, body);
      },
    },
    "/api/vote/setup": {
      POST: async (req) => {
        const body = (await req.json()) as { cast?: unknown; killer?: unknown };
        const cast = Array.isArray(body.cast)
          ? body.cast.filter((name): name is string => typeof name === "string")
          : [];
        const killer = typeof body.killer === "string" ? body.killer : "";
        if (cast.length === 0 || !cast.includes(killer)) {
          return Response.json({ error: "bad round" }, { status: 400 });
        }
        // a game-screen reload mid-round keeps the round and everyone's
        // votes; only a different cast/killer starts a fresh one
        const sameRound =
          round !== null &&
          round.killer === killer &&
          round.cast.join("\n") === cast.join("\n");
        if (!sameRound) {
          round = {
            cast,
            killer,
            startAt: Date.now(),
            endedAt: null,
            votes: new Map(),
          };
        }
        return Response.json({ ok: true });
      },
    },
    "/api/vote/state": {
      GET: () => {
        if (!round) return Response.json({ active: false });
        const tally: Record<string, number> = {};
        for (const name of round.cast) tally[name] = 0;
        for (const vote of round.votes.values()) {
          tally[vote.pick] = (tally[vote.pick] ?? 0) + 1;
        }
        return Response.json({
          active: true,
          cast: round.cast,
          // identifies the round, so phones can drop picks from an older one
          startAt: round.startAt,
          tally,
          ended: round.endedAt !== null,
          // the killer is only revealed alongside the final scoreboard
          killer: round.endedAt !== null ? round.killer : null,
          results:
            round.endedAt !== null ? voteResults(round, round.endedAt) : null,
        });
      },
    },
    "/api/vote/cast": {
      POST: async (req) => {
        if (!round) return Response.json({ error: "no round" }, { status: 400 });
        if (round.endedAt !== null) {
          return Response.json({ error: "voting closed" }, { status: 409 });
        }
        const body = (await req.json()) as { user?: unknown; pick?: unknown };
        const user =
          typeof body.user === "string" ? body.user.trim().slice(0, 24) : "";
        const pick = typeof body.pick === "string" ? body.pick : "";
        if (user.length === 0 || !round.cast.includes(pick)) {
          return Response.json({ error: "bad vote" }, { status: 400 });
        }
        // re-tapping the current pick keeps its original (better) timestamp;
        // only an actual change re-stamps the vote
        const existing = round.votes.get(user);
        if (!existing || existing.pick !== pick) {
          round.votes.set(user, { pick, at: Date.now() });
        }
        return Response.json({ ok: true });
      },
    },
    "/api/vote/kill": {
      POST: () => {
        if (round && round.endedAt === null) round.endedAt = Date.now();
        return Response.json({ ok: true });
      },
    },
    // wipe the round entirely — the game screen calls this from clearData(),
    // and the next /setup starts a fresh round with a fresh clock
    "/api/vote/reset": {
      POST: () => {
        round = null;
        return Response.json({ ok: true });
      },
    },
  },
});

console.log(
  `agent API listening on http://localhost:3001 (backend: ${BACKEND})`,
);
