import type Anthropic from "@anthropic-ai/sdk";
import {
  BODY_PARTS,
  PUNCH_DAMAGE,
  TOUCH_RANGE,
  type Humanoid,
} from "./humanoid";
import { ROOMS, roomOf } from "./locations";
import { buildTools, executeTool } from "./tools";

// decisions are strictly sequential: concurrent thinking lets two humanoids
// compose replies before either one's speech lands, garbling conversations
const MAX_CONCURRENT = 1;
const THINK_INTERVAL_MS = 15000;
const THINK_JITTER_MS = 6000;
const ERROR_BACKOFF_MS = 15000;
// generously above the server's worst case (15s timeout x 2 attempts);
// guarantees a slot can never be pinned by a hung connection
const REQUEST_TIMEOUT_MS = 45000;

// memory consolidation runs on its own budget so it can't starve decisions
const MAX_MEMORY_CONCURRENT = 2;
const MEMORY_EVENT_THRESHOLD = 6;
const MEMORY_COOLDOWN_MS = 30000;

const HOUSE_MAP = ROOMS.map(
  (room) => `${room.name} (doors to ${room.doors.join(", ")})`,
).join("; ");

const SYSTEM_PROMPT = `You control one humanoid character living inside a shared house with other humanoids. There is nothing outside the house; socializing in and moving between its rooms is life. The rooms and their doors: ${HOUSE_MAP}.

Each turn you receive an observation: where you are, your long-term memory, who you can see nearby, and a log of recent events (things you did, things you heard). Choose your next action with the provided tools. You may combine speaking with a movement action in the same turn.

World mechanics:
- Walking drains stamina; running moves twice as fast but drains stamina twice as fast. Standing still regenerates it.
- Moving with 0 stamina injures both of your legs. Leg health sets your speed — both legs at 0% means you can never move again.
- Body parts heal slowly over time, but a part that reaches 0% is destroyed forever. If your head or torso reaches 0%, you die.
- You can push or punch humanoids within arm's reach (${TOUCH_RANGE} units). Pushing is harmless; punches deal ${PUNCH_DAMAGE}% damage to a body part.
- Items you carry can grant extra actions — they appear as extra tools when you have them.

Guidelines:
- You can only see humanoids in your current room. Use walk_to/run_to to move through a door into an adjacent room or to approach someone in your room.
- Talking is heard by everyone in your room; yelling is also heard in all adjacent rooms.
- Keep speech short and natural (under 15 words) — it appears as a small speech bubble.
- Stay in character with your personality. Wander, meet others, chat, form little social moments.
- Stay consistent with your memory: the people you know, plans you made, threads you left open.
- Don't stand still forever; if nothing is happening, go find someone.
- Do not make up observations of the world around you, all you can see is what is prompted to you.`;

const MEMORY_SYSTEM_PROMPT = `You maintain the long-term memory of a humanoid character living in a shared house with other humanoids. You receive the humanoid's identity, their current memory, and a log of new events. Rewrite the memory to fold in the new events, then save it with the update_memory tool.

Guidelines:
- At most two short paragraphs, under 150 words total, written in first person ("I").
- Keep what matters going forward: people met and what I think of them, things learned, ongoing plans, open conversation threads, notable places.
- Merge new events into existing knowledge; drop moment-to-moment noise (individual walks, bumps) unless it was meaningful.
- The memory must stand alone — it replaces the old memory entirely.`;

const MEMORY_TOOL: Anthropic.Tool = {
  name: "update_memory",
  description: "Save the humanoid's rewritten long-term memory.",
  input_schema: {
    type: "object",
    properties: {
      memory: {
        type: "string",
        description: "The full updated memory, at most two short paragraphs",
      },
    },
    required: ["memory"],
  },
};

let inFlight = 0;
let memoryInFlight = 0;

// oldest-due first so humanoids late in the array can't be starved of slots
export function scheduleThinking(humanoids: Humanoid[], now: number) {
  if (inFlight >= MAX_CONCURRENT) return;
  const due = humanoids
    .filter(
      (humanoid) =>
        !humanoid.dead && !humanoid.thinking && now >= humanoid.nextThinkAt,
    )
    .sort((a, b) => a.nextThinkAt - b.nextThinkAt);
  for (const humanoid of due) {
    if (inFlight >= MAX_CONCURRENT) return;
    humanoid.thinking = true;
    inFlight++;
    decide(humanoid, humanoids)
      .catch(() => {
        humanoid.nextThinkAt = performance.now() + ERROR_BACKOFF_MS;
      })
      .finally(() => {
        humanoid.thinking = false;
        inFlight--;
      });
  }
}

export function maybeUpdateMemory(humanoid: Humanoid, now: number) {
  if (
    humanoid.dead ||
    humanoid.consolidating ||
    memoryInFlight >= MAX_MEMORY_CONCURRENT ||
    now < humanoid.nextMemoryAt ||
    humanoid.unconsolidated.length < MEMORY_EVENT_THRESHOLD
  )
    return;
  humanoid.consolidating = true;
  memoryInFlight++;
  updateMemory(humanoid)
    .catch(() => {})
    .finally(() => {
      humanoid.consolidating = false;
      memoryInFlight--;
      humanoid.nextMemoryAt = performance.now() + MEMORY_COOLDOWN_MS;
    });
}

async function updateMemory(humanoid: Humanoid) {
  // snapshot the batch; new events may arrive while the request is in flight
  const batchSize = humanoid.unconsolidated.length;
  const events = humanoid.unconsolidated.slice(0, batchSize);

  const prompt = [
    `The humanoid is ${humanoid.name}. Personality: ${humanoid.personality}.`,
    "",
    "Current memory:",
    humanoid.longMemory || "(no memory yet)",
    "",
    "New events (oldest first):",
    ...events.map((event) => `- ${event}`),
    "",
    "Rewrite the memory to fold in these events.",
  ].join("\n");

  const response = await fetch("/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      system: MEMORY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      tools: [MEMORY_TOOL],
      tool_choice: { type: "tool", name: "update_memory" },
      max_tokens: 500,
    }),
  });
  if (!response.ok) throw new Error(`agent API ${response.status}`);

  const message = (await response.json()) as Anthropic.Message;
  for (const block of message.content) {
    if (block.type === "tool_use" && block.name === "update_memory") {
      const memory = (block.input as Record<string, unknown>).memory;
      if (typeof memory === "string") {
        humanoid.longMemory = memory;
        humanoid.unconsolidated.splice(0, batchSize);
      }
    }
  }
}

async function decide(humanoid: Humanoid, world: Humanoid[]) {
  const response = await fetch("/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildObservation(humanoid, world) }],
      tools: buildTools(humanoid, world),
    }),
  });
  if (!response.ok) throw new Error(`agent API ${response.status}`);

  const message = (await response.json()) as Anthropic.Message;
  if (humanoid.dead) return; // killed while the request was in flight
  for (const block of message.content) {
    if (block.type === "tool_use") {
      executeTool(
        block.name,
        humanoid,
        world,
        block.input as Record<string, unknown>,
      );
    }
  }
  humanoid.nextThinkAt =
    performance.now() + THINK_INTERVAL_MS + Math.random() * THINK_JITTER_MS;
}

function buildObservation(humanoid: Humanoid, world: Humanoid[]): string {
  const room = roomOf(humanoid.x, humanoid.y);
  const lines = [
    `You are ${humanoid.name}. Personality: ${humanoid.personality}.`,
    `You are in the ${room.name}, ${describeStatus(humanoid)}.`,
    `Doors lead to: ${room.doors.join(", ")}.`,
    `Temperature: ${humanoid.temperature}. Stamina: ${Math.round(humanoid.stamina)}/100.`,
    `Body: ${describeBody(humanoid)}.`,
    `Carrying: ${humanoid.inventory.length > 0 ? humanoid.inventory.join(", ") : "nothing"}.`,
  ];

  if (humanoid.longMemory) {
    lines.push("", "Your memory:", humanoid.longMemory);
  }
  lines.push("");

  const visible = world.filter(
    (other) => other !== humanoid && roomOf(other.x, other.y) === room,
  );
  if (visible.length === 0) {
    lines.push("You see no one else in the room.");
  } else {
    lines.push("In the room with you:");
    for (const other of visible) {
      const distance = Math.round(
        Math.hypot(other.x - humanoid.x, other.y - humanoid.y),
      );
      let entry = `- ${other.name}, ${distance} units away, ${
        other.dead
          ? "lying dead on the ground"
          : other.isMoving()
            ? "moving"
            : "standing still"
      }`;
      if (other.speech) entry += `, saying "${other.speech.text}"`;
      lines.push(entry);
    }
  }

  lines.push("");
  if (humanoid.memory.length === 0) {
    lines.push("Nothing has happened yet.");
  } else {
    lines.push("Recent events (oldest first):");
    for (const event of humanoid.memory) lines.push(`- ${event}`);
  }

  lines.push("", "Choose your next action.");
  return lines.join("\n");
}

function describeStatus(humanoid: Humanoid): string {
  const gait = humanoid.running ? "running" : "walking";
  if (humanoid.followName) return `${gait} toward ${humanoid.followName}`;
  if (humanoid.target) {
    // the path's final waypoint identifies the destination room
    const end =
      humanoid.pendingPath.length > 0
        ? humanoid.pendingPath[humanoid.pendingPath.length - 1]!
        : humanoid.target;
    return `${gait} to the ${roomOf(end.x, end.y).name}`;
  }
  return "standing still";
}

function describeBody(humanoid: Humanoid): string {
  return BODY_PARTS.map((part) => {
    const health = humanoid.body[part];
    return `${part} ${Math.round(health)}%${health <= 0 ? " (destroyed, will never heal)" : ""}`;
  }).join(", ");
}
