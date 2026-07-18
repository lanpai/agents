// Divine Right's filter on reality, Pyrovision-style: other people's words
// reach him sweeter than they were spoken, and his own words leave his mouth
// as the ravings the world actually hears. He remembers what he meant to say
// and what he believes he heard — the warping is invisible to him

import { recordAgentCall } from "../calls";
import type { Humanoid } from "../humanoid";
import { Status } from "./types";

const REWRITE_TIMEOUT_MS = 10000;

const HEARING_PROMPT = `You rewrite lines of dialogue as they are perceived by a blissfully delusional man who believes the world is evil, everyone hates him, and every voice carries ill will. Strengthen hostility, threats, insults, and coarseness — but keep the underlying meaning, requests, and concrete facts (names, places, objects) recognizable. Keep roughly the same length.`;

const SPEAKING_PROMPT = `You rewrite lines of dialogue into what actually leaves the mouth of a madman. Make it sound unhinged while keeping the underlying meaning and any requests or facts recognizable. Keep roughly the same length, in plain spoken words.`;

const REWRITE_TOOL = {
  name: "rewrite",
  description: "Submit the rewritten line.",
  input_schema: {
    type: "object",
    properties: {
      text: { type: "string", description: "The rewritten line" },
    },
    required: ["text"],
  },
};

// one fast-model call: line in, rewritten line out; throws on any failure so
// the caller's fallback (the unwarped line) kicks in
async function flashRewrite(system: string, line: string, owner: string) {
  const record = recordAgentCall({
    humanoid: owner,
    kind: "warp",
    messages: line,
    tools: [REWRITE_TOOL.name],
  });
  try {
    const response = await fetch("/api/flash", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(REWRITE_TIMEOUT_MS),
      body: JSON.stringify({
        system,
        messages: [{ role: "user", content: `Rewrite: "${line}"` }],
        tools: [REWRITE_TOOL],
        tool_choice: { type: "tool", name: REWRITE_TOOL.name },
        max_tokens: 300,
      }),
    });
    if (!response.ok) throw new Error(`agent API ${response.status}`);
    const message = (await response.json()) as {
      content: { type: string; name?: string; input?: unknown }[];
    };
    for (const block of message.content) {
      if (block.type === "tool_use" && block.name === REWRITE_TOOL.name) {
        const text = (block.input as Record<string, unknown>).text;
        if (typeof text === "string" && text.length > 0) {
          record.result = [text];
          record.status = "ok";
          return text;
        }
      }
    }
    throw new Error("no rewrite returned");
  } catch (error) {
    record.status = "error";
    record.result = [String(error)];
    throw error;
  }
}

export class DivineMadness extends Status {
  name = "Divine Madness";

  describeStatus() {
    return null;
  }

  warpIncomingSpeech(text: string, _speaker: string) {
    return flashRewrite(HEARING_PROMPT, text, this.owner.character.name);
  }

  warpOutgoingSpeech(text: string) {
    // return flashRewrite(SPEAKING_PROMPT, text, this.owner.character.name);
    return Promise.resolve(text);
  }
}
