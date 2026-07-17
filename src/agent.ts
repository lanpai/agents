import type Anthropic from "@anthropic-ai/sdk";
import { simNow } from "./time";
import { recordAgentCall } from "./calls";
import { BODY_PARTS, formatFeet, frozenRooms, type Humanoid } from "./humanoid";
import {
  describeItemInInventory,
  describeInteractableOnGround,
} from "./interactables";
import { ROOMS, roomOf } from "./locations";
import { buildTools, executeTool } from "./tools";

// decisions are serialized per room (a thinking humanoid freezes its room, so
// roommates can't compose replies past each other), but different rooms may
// think at the same time — this only caps total API concurrency
const MAX_CONCURRENT = 3;
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

const SYSTEM_PROMPT = `You control one humanoid character living inside a shared house with other humanoids. There is nothing outside the house; socializing in and moving between its rooms is life.

Each turn you receive an observation: where you are, your long-term memory, who you can see nearby, and a log of recent events (things you did, things you heard). Choose your next action with the provided tools. You may combine speaking with a movement action in the same turn.

Guidelines:
- Stay in character with your character description. Wander, meet others, chat, form little social moments.
- Stay consistent with your memory: the people you know, plans you made, threads you left open.
- Don't stand still forever; if nothing is happening, go find someone.
- Do not make up observations of the world around you, all you can see is what is prompted to you.
- Do not pretend to interact with objects you are not explicitly told are visible to you.

DO NOT PRETEND TO INTERACT WITH OBJECTS THAT YOU DO NOT HAVE A TOOL CALL FOR!`;

const MEMORY_SYSTEM_PROMPT = `You maintain the long-term memory of a humanoid character living in a shared house with other humanoids. You receive the humanoid's identity, their current memory, and a log of new events. Rewrite the memory to fold in the new events, then save it with the update_memory tool.

Guidelines:
- Everything should be in second person (eg. You remember seeing someone walk by you earlier).
- At most two short paragraphs, under 150 words total, written in first person ("I").
- Keep what matters going forward: people met and what I think of them, things learned, ongoing plans, open conversation threads, notable places and things.
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

// the sim pauses while a decision is in flight, so the world an agent acted
// on is the same world its actions land in (memory consolidation doesn't
// pause anything — it only rewrites private state)
export function isThinking(): boolean {
  return inFlight > 0;
}

// oldest-due first so humanoids late in the array can't be starved of slots
export function scheduleThinking(humanoids: Humanoid[], now: number) {
  if (inFlight >= MAX_CONCURRENT) return;
  const frozen = frozenRooms(humanoids);
  const due = humanoids
    .filter(
      (humanoid) =>
        !humanoid.dead && !humanoid.thinking && now >= humanoid.nextThinkAt,
    )
    .sort((a, b) => a.nextThinkAt - b.nextThinkAt);
  for (const humanoid of due) {
    if (inFlight >= MAX_CONCURRENT) return;
    // never start a decision in a room where time is standing still — that
    // includes rooms frozen by a pick earlier in this same pass
    const room = roomOf(humanoid.x, humanoid.y);
    if (frozen.has(room)) continue;
    frozen.add(room);
    humanoid.thinking = true;
    inFlight++;
    decide(humanoid, humanoids)
      .catch(() => {
        humanoid.nextThinkAt = simNow() + ERROR_BACKOFF_MS;
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
      humanoid.nextMemoryAt = simNow() + MEMORY_COOLDOWN_MS;
    });
}

async function updateMemory(humanoid: Humanoid) {
  // snapshot the batch; new events may arrive while the request is in flight
  const batchSize = humanoid.unconsolidated.length;
  const events = humanoid.unconsolidated.slice(0, batchSize);

  const prompt = [
    `The humanoid ${humanoid.character.name} is prompted with "${humanoid.character.description}"`,
    "",
    "Current memory:",
    humanoid.longMemory || "(no memory yet)",
    "",
    "New events (oldest first):",
    ...events.map((event) => `- ${event}`),
    "",
    "Rewrite the memory to fold in these events.",
  ].join("\n");

  const record = recordAgentCall({
    humanoid: humanoid.character.name,
    kind: "memory",
    messages: prompt,
    tools: [MEMORY_TOOL.name],
  });
  try {
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
          record.result = [memory];
        }
      }
    }
    record.status = "ok";
  } catch (error) {
    record.status = "error";
    record.result = [String(error)];
    throw error;
  }
}

async function decide(humanoid: Humanoid, world: Humanoid[]) {
  const observation = buildObservation(humanoid, world);
  const tools = buildTools(humanoid, world);
  const record = recordAgentCall({
    humanoid: humanoid.character.name,
    kind: "decision",
    messages: observation,
    tools: tools.map((tool) => tool.name),
  });
  try {
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: observation }],
        tools,
      }),
    });
    if (!response.ok) throw new Error(`agent API ${response.status}`);

    const message = (await response.json()) as Anthropic.Message;
    record.result = message.content
      .filter((block) => block.type === "tool_use")
      .map((block) => `${block.name}(${JSON.stringify(block.input)})`);
    record.status = "ok";

    if (humanoid.dead) return; // killed while the request was in flight
    // set the cadence before executing: tools may pull nextThinkAt closer
    // (e.g. find_path schedules an immediate follow-up), which must survive
    humanoid.nextThinkAt =
      simNow() + THINK_INTERVAL_MS + Math.random() * THINK_JITTER_MS;
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
  } catch (error) {
    record.status = "error";
    record.result = [String(error)];
    throw error;
  }
}

function buildObservation(humanoid: Humanoid, world: Humanoid[]): string {
  const room = roomOf(humanoid.x, humanoid.y);
  const lines = [
    `Your name is ${humanoid.character.name}.`,
    humanoid.character.description,
    "",
    describeMovement(humanoid),
    `You see doors leading to ${room.doors.map((door) => ROOMS.find((room) => room.name === door)?.promptName).join(", ")}.`,
    describeBody(humanoid),
  ];

  for (const status of humanoid.statuses.values()) {
    const description = status.describeStatus(humanoid, humanoid);
    if (description) lines.push("", description);
  }

  const heldItems = humanoid.carrying;
  for (const heldItem of heldItems) {
    lines.push("", describeItemInInventory(heldItem, humanoid));
  }

  if (humanoid.longMemory) {
    lines.push("", humanoid.longMemory);
  }

  const visible = world.filter(
    (other) => other !== humanoid && roomOf(other.x, other.y) === room,
  );
  if (visible.length === 0) {
    lines.push("", "You see no one else in the room.");
  } else {
    for (const other of visible) {
      const distance = Math.hypot(other.x - humanoid.x, other.y - humanoid.y);
      let entry = `You see ${other.character.name} ${
        other.dead
          ? "lying dead on the ground"
          : other.isMoving()
            ? "moving"
            : "standing still"
      } in the room with you, ${formatFeet(distance)} away`;
      if (other.speech) entry += `, saying "${other.speech.text}"`;

      lines.push("", entry, other.character.describeHumanoid(other, humanoid));

      for (const status of other.statuses.values()) {
        const description = status.describeStatus(other, humanoid);
        if (description) lines.push(description);
      }
    }
  }

  for (const interactable of room.interactables) {
    lines.push("", describeInteractableOnGround(interactable, humanoid));
  }

  if (humanoid.memory.length > 0) {
    lines.push("", "The following occured recently (oldest first):");
    for (const event of humanoid.memory) lines.push(`- ${event}`);
  }

  lines.push("", "Choose your next action.");
  return lines.filter((x) => x !== null).join("\n");
}

export function describeMovement(humanoid: Humanoid): string {
  const gait = humanoid.running ? "running" : "walking";
  if (humanoid.followName)
    return `You are ${gait} toward ${humanoid.followName} in ${roomOf(humanoid.x, humanoid.y).promptName}`;
  if (humanoid.target) {
    // the path's final waypoint identifies the destination room
    const end =
      humanoid.pendingPath.length > 0
        ? humanoid.pendingPath[humanoid.pendingPath.length - 1]!
        : humanoid.target;
    return `You are ${gait} to the ${roomOf(end.x, end.y).name} from ${roomOf(humanoid.x, humanoid.y).promptName}`;
  }
  return `You are standing still in ${roomOf(humanoid.x, humanoid.y).promptName}`;
}

export function describeBody(humanoid: Humanoid): string | null {
  const lines: string[] = [];

  if (humanoid.stamina >= 80) {
  } else if (humanoid.stamina >= 50) {
    lines.push("", "You are starting to get tired.");
  } else if (humanoid.stamina >= 25) {
    lines.push("", "You are very tired.");
  } else if (humanoid.stamina > 0) {
    lines.push("", "You are almost at the point of complete exhaustion.");
  } else {
    lines.push(
      "",
      "You are completely exhausted and must rest before you can move.",
    );
  }

  for (const part of BODY_PARTS) {
    const health = humanoid.body[part];
    if (health >= 100) continue;
    else if (health >= 75) lines.push("", `Your ${part} is in a bit of pain.`);
    else if (health >= 50)
      lines.push("", `Your ${part} is in a fair amount of pain.`);
    else if (health >= 25) lines.push("", `Your ${part} is in a lot of pain.`);
    else if (health > 0)
      lines.push("", `Your ${part} is in excruciating pain.`);
    else
      lines.push(
        "",
        `Your ${part} is hurt to the point of being unusable, you don't feel it will get better.`,
      );
  }

  if (lines.length === 0) return null;

  return lines.join("\n");
}
