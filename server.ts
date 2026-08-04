import "bun";
import Anthropic from "@anthropic-ai/sdk";
import { buildRoutedIclFields, isRoutedVoice } from "./routedTts";
import {
  SPEECH_EMOTIONS,
  type SpeechEmotion,
} from "./src/speechEmotion";
import {
  isSpeechLanguage,
  SPEECH_LANGUAGE_NAMES,
  type SpeechLanguage,
} from "./src/speechLanguage";

// which model serves agent decisions; the frontend always speaks Anthropic
// shapes — non-sonnet paths translate to/from OpenAI-compatible APIs
type Backend = "sonnet" | "k3" | "deepseek" | "gemini";

const configuredBackend = Bun.env.AGENT_BACKEND ?? "gemini";
const BACKENDS: Backend[] = ["sonnet", "k3", "deepseek", "gemini"];
if (!BACKENDS.includes(configuredBackend as Backend)) {
  throw new Error(
    `Invalid AGENT_BACKEND "${configuredBackend}". Expected one of: ${BACKENDS.join(", ")}`,
  );
}
const BACKEND = configuredBackend as Backend;

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

const GEMINI_FLASH: OpenAICompatibleConfig = {
  label: "gemini-flash",
  url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  model: Bun.env.GEMINI_MODEL ?? "gemini-3-flash-preview",
  apiKeyEnv: "GOOGLE_GENERATIVE_AI_API_KEY",
  timeoutMs: 30000,
  maxTokensMultiplier: 1,
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

type TtsRequest = {
  text: string;
  speakerEmbedding?: number[];
  voice?: string;
  serverUrl?: string;
  routedVoice?: string;
  emotion?: string;
  language?: SpeechLanguage;
  crossLanguageEmotion?: boolean;
};

const QWEN_TTS_URL = (Bun.env.QWEN_TTS_URL ?? "http://127.0.0.1:9001").replace(
  /\/$/,
  "",
);
const QWEN_TTS_ALLOWED_HOSTS = new Set(
  (Bun.env.QWEN_TTS_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
);
try {
  QWEN_TTS_ALLOWED_HOSTS.add(new URL(QWEN_TTS_URL).hostname.toLowerCase());
} catch {
  // The startup request path will surface an invalid configured URL.
}
const QWEN_TTS_MODEL = Bun.env.QWEN_TTS_MODEL;
const QWEN_TTS_DEFAULT_VOICE =
  Bun.env.QWEN_TTS_DEFAULT_VOICE ?? "web_nori_v0";
const qwenModelCache = new Map<string, Promise<string>>();

function qwenModel(ttsUrl: string): Promise<string> {
  if (QWEN_TTS_MODEL) return Promise.resolve(QWEN_TTS_MODEL);
  let promise = qwenModelCache.get(ttsUrl);
  if (!promise) {
    promise = fetch(`${ttsUrl}/v1/models`, {
      signal: AbortSignal.timeout(5000),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`model discovery ${response.status}`);
        const listing = (await response.json()) as {
          data?: { id?: unknown }[];
        };
        const model = listing.data?.[0]?.id;
        if (typeof model !== "string" || model.length === 0) {
          throw new Error("model discovery returned no model id");
        }
        return model;
      })
      .catch(() => "/opt/models/qwen3-tts");
    qwenModelCache.set(ttsUrl, promise);
  }
  return promise;
}

function requestTtsUrl(value: unknown): string | null {
  if (value === undefined) return QWEN_TTS_URL;
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !isAllowedTtsHost(url.hostname) ||
      !url.port ||
      url.username ||
      url.password
    )
      return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function isAllowedTtsHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === "127.0.0.1" ||
    host === "localhost" ||
    host === "[::1]" ||
    host.endsWith(".ts.net") ||
    QWEN_TTS_ALLOWED_HOSTS.has(host)
  )
    return true;
  const ipv4 = host.split(".").map(Number);
  return (
    ipv4.length === 4 &&
    ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    ipv4[0] === 100 &&
    ipv4[1]! >= 64 &&
    ipv4[1]! <= 127
  );
}

async function callQwenTts(req: Request): Promise<Response> {
  let body: TtsRequest;
  try {
    body = (await req.json()) as TtsRequest;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.text !== "string" || body.text.trim().length === 0) {
    return Response.json({ error: "text must be a non-empty string" }, { status: 400 });
  }
  if (body.text.length > 4000) {
    return Response.json({ error: "text exceeds 4000 characters" }, { status: 400 });
  }

  const ttsUrl = requestTtsUrl(body.serverUrl);
  if (!ttsUrl) {
    return Response.json(
      {
        error:
          "serverUrl must be an allowed local/Tailscale http(s) URL with a port",
      },
      { status: 400 },
    );
  }

  const embedding = body.speakerEmbedding;
  if (
    embedding !== undefined &&
    (!Array.isArray(embedding) ||
      embedding.length === 0 ||
      embedding.length > 4096 ||
      !embedding.every((value) =>
        typeof value === "number" && Number.isFinite(value)))
  ) {
    return Response.json(
      { error: "speakerEmbedding must be a non-empty finite number array" },
      { status: 400 },
    );
  }

  const payload: Record<string, unknown> = {
    model: await qwenModel(ttsUrl),
    input: body.text,
    task_type: "Base",
    language: isSpeechLanguage(body.language)
      ? SPEECH_LANGUAGE_NAMES[body.language]
      : "English",
    stream: true,
    response_format: "pcm",
    max_new_tokens: 4096,
  };
  let routedRoute: string | undefined;
  if (body.routedVoice !== undefined) {
    if (!isRoutedVoice(body.routedVoice)) {
      return Response.json({ error: "unknown routedVoice" }, { status: 400 });
    }
    const emotion =
      typeof body.emotion === "string" &&
      (SPEECH_EMOTIONS as readonly string[]).includes(body.emotion)
        ? (body.emotion as SpeechEmotion)
        : "neutral";
    try {
      const {
        route,
        referenceLanguage,
        crossLanguageReference,
        ...fields
      } = await buildRoutedIclFields(
        body.routedVoice,
        emotion,
        isSpeechLanguage(body.language) ? body.language : "en",
        body.crossLanguageEmotion === true,
      );
      routedRoute = route;
      if (crossLanguageReference) {
        payload.__crossLanguageReference = referenceLanguage;
      }
      Object.assign(payload, fields);
    } catch (error) {
      return Response.json(
        { error: `routed TTS assets unavailable: ${String(error)}` },
        { status: 500 },
      );
    }
  } else if (embedding) {
    payload.speaker_embedding = embedding;
    payload.x_vector_only_mode = true;
  } else {
    payload.voice =
      typeof body.voice === "string" && body.voice.length > 0
        ? body.voice
        : QWEN_TTS_DEFAULT_VOICE;
  }

  const crossLanguageReference = payload.__crossLanguageReference;
  delete payload.__crossLanguageReference;
  let upstream: Response;
  try {
    upstream = await fetch(`${ttsUrl}/v1/audio/speech`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(120000)]),
    });
  } catch (error) {
    return Response.json(
      { error: `Qwen TTS unavailable: ${String(error)}` },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    if (crossLanguageReference && isRoutedVoice(body.routedVoice)) {
      try {
        const { route, referenceLanguage: _reference, crossLanguageReference: _cross, ...safeFields } =
          await buildRoutedIclFields(
            body.routedVoice,
            "neutral",
            isSpeechLanguage(body.language) ? body.language : "en",
            false,
          );
        routedRoute = route;
        for (const key of ["ref_audio", "ref_text", "speaker_embedding", "x_vector_only_mode", "language"])
          delete payload[key];
        Object.assign(payload, safeFields);
        upstream = await fetch(`${ttsUrl}/v1/audio/speech`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.any([req.signal, AbortSignal.timeout(120000)]),
        });
      } catch {
        // Preserve the original upstream error handling below.
      }
    }
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return Response.json(
      { error: `Qwen TTS ${upstream.status}: ${detail.slice(0, 500)}` },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "audio/pcm",
      "cache-control": "no-store",
      "x-audio-sample-rate": "24000",
      ...(body.routedVoice
        ? {
            "x-tts-voice": body.routedVoice,
            "x-tts-route": routedRoute ?? "neutral",
            "x-tts-language": String(payload.language),
            ...(crossLanguageReference && routedRoute !== "neutral"
              ? { "x-tts-reference-language": String(crossLanguageReference) }
              : {}),
          }
        : {}),
    },
  });
}

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
// viewers open /vote.html, pick a display name, and guess two things: who
// the killer will turn out to be, and who will be the first victim. The
// killer is emergent — nobody (including the game) knows at setup — so the
// game screen reports both answers at the moment the killer goes for the
// kill. Each correct guess earns up to MAX_POINTS, decaying linearly from
// round start to the kill, so early (and unchanged) votes are worth more.
// State lives in memory: a server restart wipes it.

const MAX_POINTS = 1000;
const QUESTIONS = ["killer", "victim"] as const;
type Question = (typeof QUESTIONS)[number];
type Vote = { pick: string; at: number };

type VoteRound = {
  cast: string[];
  startAt: number;
  endedAt: number | null;
  answers: Record<Question, string> | null; // reported with the kill
  // keyed by the viewer's chosen display name; `at` re-stamps on change
  votes: Map<string, Partial<Record<Question, Vote>>>;
};

let round: VoteRound | null = null;

function voteResults(current: VoteRound, endedAt: number) {
  const span = Math.max(1, endedAt - current.startAt);
  const score = (vote: Vote | undefined, answer: string) =>
    vote && answer && vote.pick === answer
      ? Math.max(0, Math.round((MAX_POINTS * (endedAt - vote.at)) / span))
      : 0;
  return [...current.votes.entries()]
    .map(([user, votes]) => {
      const killerPoints = score(votes.killer, current.answers?.killer ?? "");
      const victimPoints = score(votes.victim, current.answers?.victim ?? "");
      return {
        user,
        killerPick: votes.killer?.pick ?? null,
        victimPick: votes.victim?.pick ?? null,
        killerPoints,
        victimPoints,
        points: killerPoints + victimPoints,
      };
    })
    .sort((a, b) => b.points - a.points);
}

Bun.serve({
  port: Number(Bun.env.API_PORT ?? 3002),
  routes: {
    "/api/health": Response.json({ ok: true, backend: BACKEND }),
    "/api/tts": { POST: callQwenTts },
    "/api/agent": {
      POST: async (req) => {
        const body = (await req.json()) as AgentRequest;
        if (BACKEND === "k3") return callOpenAICompatible(KIMI, body);
        if (BACKEND === "deepseek") return callOpenAICompatible(DEEPSEEK, body);
        if (BACKEND === "gemini") return callOpenAICompatible(GEMINI_FLASH, body);
        return callSonnet(body);
      },
    },
    "/api/flash": {
      POST: async (req) => {
        const body = (await req.json()) as AgentRequest;
        if (BACKEND === "gemini") return callOpenAICompatible(GEMINI_FLASH, body);
        return callOpenAICompatible(DEEPSEEK_FLASH, body);
      },
    },
    "/api/vote/setup": {
      POST: async (req) => {
        const body = (await req.json()) as { cast?: unknown };
        const cast = Array.isArray(body.cast)
          ? body.cast.filter((name): name is string => typeof name === "string")
          : [];
        if (cast.length === 0) {
          return Response.json({ error: "bad round" }, { status: 400 });
        }
        // a game-screen reload mid-round keeps the round and everyone's
        // votes; only a different cast starts a fresh one
        const sameRound =
          round !== null && round.cast.join("\n") === cast.join("\n");
        if (!sameRound) {
          round = {
            cast,
            startAt: Date.now(),
            endedAt: null,
            answers: null,
            votes: new Map(),
          };
        }
        return Response.json({ ok: true });
      },
    },
    "/api/vote/state": {
      GET: () => {
        if (!round) return Response.json({ active: false });
        const tally: Record<Question, Record<string, number>> = {
          killer: {},
          victim: {},
        };
        for (const question of QUESTIONS) {
          for (const name of round.cast) tally[question][name] = 0;
        }
        for (const votes of round.votes.values()) {
          for (const question of QUESTIONS) {
            const vote = votes[question];
            if (vote) tally[question][vote.pick] = (tally[question][vote.pick] ?? 0) + 1;
          }
        }
        return Response.json({
          active: true,
          cast: round.cast,
          // identifies the round, so phones can drop picks from an older one
          startAt: round.startAt,
          tally,
          ended: round.endedAt !== null,
          // the answers are only revealed alongside the final scoreboard
          answers: round.endedAt !== null ? round.answers : null,
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
        const body = (await req.json()) as {
          user?: unknown;
          question?: unknown;
          pick?: unknown;
        };
        const user =
          typeof body.user === "string" ? body.user.trim().slice(0, 24) : "";
        const question = QUESTIONS.find((key) => key === body.question);
        const pick = typeof body.pick === "string" ? body.pick : "";
        if (user.length === 0 || !question || !round.cast.includes(pick)) {
          return Response.json({ error: "bad vote" }, { status: 400 });
        }
        // re-tapping the current pick keeps its original (better) timestamp;
        // only an actual change re-stamps the vote
        const votes = round.votes.get(user) ?? {};
        const existing = votes[question];
        if (!existing || existing.pick !== pick) {
          votes[question] = { pick, at: Date.now() };
        }
        round.votes.set(user, votes);
        return Response.json({ ok: true });
      },
    },
    "/api/vote/kill": {
      POST: async (req) => {
        const body = (await req
          .json()
          .catch(() => ({}))) as { killer?: unknown; victim?: unknown };
        if (round && round.endedAt === null) {
          const valid = (name: unknown) =>
            typeof name === "string" && round!.cast.includes(name) ? name : "";
          round.endedAt = Date.now();
          round.answers = {
            killer: valid(body.killer),
            victim: valid(body.victim),
          };
        }
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
  `agent API listening on http://localhost:${Bun.env.API_PORT ?? 3002} (backend: ${BACKEND})`,
);
