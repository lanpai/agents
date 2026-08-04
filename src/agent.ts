import type Anthropic from "@anthropic-ai/sdk";
import { simNow } from "./time";
import { recordAgentCall } from "./calls";
import { BODY_PARTS, formatFeet, frozenRooms, type Humanoid } from "./humanoid";
import {
  describeItemInInventory,
  describeInteractableOnGround,
} from "./interactables";
import { ROOMS, roomOf } from "./locations";
import {
  getSpeechMode,
  SPEECH_LANGUAGE_NAMES,
} from "./speechLanguage";
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

const SYSTEM_PROMPT = `You control one character who works at Spellbrush, a company that created the generative anime image model nijijourney. You are currently at the office. There is nothing outside the office, you can only be inside; socializing in and moving between its rooms is life.

Each turn you receive your long-term memory, then recent events in order (things you did, things you heard and saw), and finally an observation of the present moment. Choose your next action with the provided tools. You may combine speaking with a movement action in the same turn.

Guidelines:
- Stay in character with your character description. Wander, meet others, chat, form little social moments.
- Stay consistent with your memory: the people you know, plans you made, threads you left open.
- Don't stand still forever; if nothing is happening, go find someone.
- If someone is on their way to you or you agreed to meet, give them a moment to arrive before wandering off to look for them.
- Do not make up observations of the world around you, all you can see is what is prompted to you.
- Do not pretend to interact with objects you are not explicitly told are visible to you.
- For every say/yell call, written_message is the complete natural text shown to the audience. The runtime derives the spoken line from that exact text. pronunciations may contain only compact token substitutions for numbers, symbols, versions, or acronyms that TTS could misread, such as 5.0 → five point zero or SS+ → S S plus. Never place ordinary words, phrases, added details, or paraphrases in pronunciations. Use [] when none are needed. The name Hirai is handled automatically.

DO NOT MAKE UP ANY LOCATIONS IN THE MANOR! THE ROOMS IN THE MANOR ARE AS FOLLOWS:
${ROOMS.map((room) => `- ${room.promptName}`).join("\n")}

DO NOT PRETEND TO INTERACT WITH OBJECTS THAT YOU DO NOT HAVE A TOOL CALL FOR!
DO NOT PRETEND TO BE CARRYING OBJECTS THAT YOU ARE NOT TOLD ARE ON YOU!
DO NOT MAKE UP ANY NEW NAMES OR BRING UP ANY NEW CHARACTERS UNLESS YOU ARE EXPLICITLY TOLD TO DO SO!
DO NOT MAKE UP BACKGROUNDS FOR OTHERS OR YOURSELF! YOU WILL BE EXPLICITLY TOLD ABOUT NEW THINGS AND OTHERS WILL REVEAL THEIR OWN BACKGROUNDS TO YOU!
DO NOT SAY YOU ARE GOING SOMEWHERE WITHOUT ACTUALLY MAKING A TOOL CALL TO MOVE IN THE SAME TURN!`;

const MEMORY_SYSTEM_PROMPT = `You maintain the long-term memory of a character working in an office with other characters. You receive the character's identity, their current memory, and a log of new events. Rewrite the memory to fold in the new events, then save it with the update_memory tool.

Guidelines:
- Everything should be in second person (eg. You remember hearing yelling from the north hall while you were in the south hall).
- At most two short paragraphs, under 150 words total, written in second person ("You").
- Keep what matters going forward: people met and what I think of them, what they look like, things learned, ongoing plans, open conversation threads, notable places and things.
- Merge new events into existing knowledge; drop moment-to-moment noise (individual walks, bumps) unless it was meaningful.
- Keep in mind the name of the room that things happened in or you found notable objects in so you can navigate back later.
- The memory must stand alone — it replaces the old memory entirely.`;

const MEMORY_TOOL: Anthropic.Tool = {
  name: "update_memory",
  description: "Save the character's rewritten long-term memory.",
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

export function maybeUpdateMemory(
  humanoid: Humanoid,
  now: number,
  world: Humanoid[],
) {
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
  updateMemory(humanoid, world)
    .catch(() => {})
    .finally(() => {
      humanoid.consolidating = false;
      memoryInFlight--;
      humanoid.nextMemoryAt = simNow() + MEMORY_COOLDOWN_MS;
    });
}

async function updateMemory(humanoid: Humanoid, world: Humanoid[]) {
  // snapshot the batch; new events may arrive while the request is in flight
  const batchSize = humanoid.unconsolidated.length;
  const events = humanoid.unconsolidated.slice(0, batchSize);

  const messages: { role: "user"; content: string }[] = [
    {
      role: "user",
      content: `The humanoid ${humanoid.character.name} is prompted with "${humanoid.character.description}"`,
    },
    {
      role: "user",
      content: `Current memory:\n${humanoid.longMemory || "(no memory yet)"}`,
    },
    // each new event rides as its own message, oldest first
    ...events.map((event) => ({ role: "user" as const, content: event })),
    {
      role: "user",
      content: buildObservation(humanoid, world),
    },
    { role: "user", content: "Rewrite the memory to fold in these events." },
  ];

  const record = recordAgentCall({
    humanoid: humanoid.character.name,
    kind: "memory",
    messages: messages.map((message) => message.content).join("\n---\n"),
    tools: [MEMORY_TOOL.name],
  });
  try {
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        system: MEMORY_SYSTEM_PROMPT,
        messages,
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
  const system = buildSystemPrompt(humanoid);
  const messages = buildMessages(humanoid, world);
  const tools = buildTools(humanoid, world);
  const record = recordAgentCall({
    humanoid: humanoid.character.name,
    kind: "decision",
    messages: [
      `[system]\n${system}`,
      ...messages.map((message) => message.content),
    ].join("\n---\n"),
    tools: tools.map((tool) => tool.name),
  });
  try {
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        system,
        messages,
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
    for (const block of orderToolCalls(message.content)) {
      executeTool(
        block.name,
        humanoid,
        world,
        block.input as Record<string, unknown>,
      );
    }
  } catch (error) {
    record.status = "error";
    record.result = [String(error)];
    throw error;
  }
}

const SPEECH_TOOLS = new Set(["say", "yell"]);
const MOVE_TOOLS = new Set(["walk_to", "run_to"]);

// talking roots you in place, so when one turn combines speech and movement
// the speech must land first or it would cancel the freshly-issued move
function orderToolCalls(
  content: Anthropic.Message["content"],
): Anthropic.ToolUseBlock[] {
  const calls = content.filter(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  const hasSpeech = calls.some((block) => SPEECH_TOOLS.has(block.name));
  const hasMove = calls.some((block) => MOVE_TOOLS.has(block.name));
  if (!hasSpeech || !hasMove) return calls;
  return [
    ...calls.filter((block) => SPEECH_TOOLS.has(block.name)),
    ...calls.filter((block) => !SPEECH_TOOLS.has(block.name)),
  ];
}

// the stable frame: world rules plus who this humanoid is
function buildSystemPrompt(humanoid: Humanoid): string {
  return [
    SYSTEM_PROMPT,
    "",
    `Your name is ${humanoid.character.name}.`,
    humanoid.character.description,
    "",
    speechLanguagePrompt(humanoid),
  ].join("\n");
}

function speechLanguagePrompt(humanoid: Humanoid): string {
  if (getSpeechMode() === "presentation") {
    return "Presentation language mode is active. Speak every line in English and set language to en, even if English is not normally one of your languages.";
  }
  const { native, known } = humanoid.character.language;
  return `Character language mode is active. You understand every language used in this fictional world. You natively speak ${SPEECH_LANGUAGE_NAMES[native]} and can speak ${known.map((language) => SPEECH_LANGUAGE_NAMES[language]).join(", ")}.
- When directly replying to someone, use the language they most recently used if you can speak it.
- Otherwise use your native language when alone or beginning a conversation.
- When addressing a group, multilingual speakers use English if an English-only person is present, Japanese if Hirai is present and no English-only person is present, otherwise Chinese when Eric or Yanghua is present. A character who cannot speak that group language continues in their own language.
- Always set the say/yell language field to the language the message is actually written in.`;
}

// long-term memory first, then each recent event as its own message, then
// the current-state observation asking for an action
function buildMessages(
  humanoid: Humanoid,
  world: Humanoid[],
): { role: "user"; content: string }[] {
  const messages: { role: "user"; content: string }[] = [];

  if (humanoid.longMemory) {
    messages.push({ role: "user", content: humanoid.longMemory });
  }

  for (const event of humanoid.memory) {
    messages.push({ role: "user", content: event });
  }

  messages.push({
    role: "user",
    content: buildObservation(humanoid, world),
  });

  return messages;
}

// a snapshot of the present moment: surroundings, self-state, and the ask
function buildObservation(humanoid: Humanoid, world: Humanoid[]): string {
  const room = roomOf(humanoid.x, humanoid.y);
  const lines = [
    describeMovement(humanoid),
    `You see doors leading to ${room.doors.map((door) => ROOMS.find((room) => room.name === door)?.promptName).join(", ")}.`,
    describeBody(humanoid),
  ];

  for (const status of humanoid.statuses.values()) {
    const description = status.describeStatus(humanoid, humanoid);
    if (description) lines.push("", description);
  }

  const heldItems = humanoid.carrying;
  if (heldItems.length === 0) {
    lines.push("", "You aren't carrying anything on you.");
  } else {
    for (const heldItem of heldItems) {
      lines.push("", describeItemInInventory(heldItem, humanoid));
    }
  }

  const visible = world.filter(
    (other) => other !== humanoid && roomOf(other.x, other.y) === room,
  );
  if (visible.length === 0) {
    lines.push("", "You see no one else in the room.");
  } else {
    for (const other of visible) {
      const distance = Math.hypot(other.x - humanoid.x, other.y - humanoid.y);
      const followingMe = other.followName === humanoid.character.name;
      // a follower who has caught up is not "standing still" — they're still
      // attached, and the viewer needs to know walking away brings them along
      let entry = `You see ${other.character.name} ${
        other.dead
          ? "lying dead on the ground"
          : other.followName
            ? `${other.isMoving() ? "following" : "staying beside"} ${
                followingMe ? "you" : other.followName
              }`
            : other.isMoving()
              ? "moving"
              : "standing still"
      } in the room with you, ${formatFeet(distance)} away`;
      if (other.speech)
        entry += `, saying in ${SPEECH_LANGUAGE_NAMES[other.speech.language]}${other.speech.addressing === "everyone in the room" ? "" : ` to ${other.speech.addressing}`}: "${other.speech.text}"`;
      if (!other.dead && followingMe)
        entry +=
          ". They will come along wherever you go — to travel together, simply lead the way";

      lines.push("", entry, other.character.describeHumanoid(other, humanoid));

      for (const status of other.statuses.values()) {
        const description = status.describeStatus(other, humanoid);
        if (description) lines.push(description);
      }
    }
  }

  // travelers one room away and headed here are visible intent: without
  // this, whoever arrives first sees an empty room and doubles back to look
  // for the very person who is seconds behind them
  for (const other of world) {
    if (other === humanoid || other.dead) continue;
    const otherRoom = roomOf(other.x, other.y);
    if (otherRoom === room || !room.doors.includes(otherRoom.name)) continue;
    if (other.followName === humanoid.character.name) {
      lines.push(
        "",
        `${other.character.name} is following you and about to enter from ${otherRoom.promptName}.`,
      );
      continue;
    }
    if (!other.target) continue;
    const end =
      other.pendingPath.length > 0
        ? other.pendingPath[other.pendingPath.length - 1]!
        : other.target;
    if (roomOf(end.x, end.y) === room) {
      lines.push(
        "",
        `${other.character.name} is about to enter the room from ${otherRoom.promptName}.`,
      );
    }
  }

  for (const interactable of room.interactables) {
    lines.push("", describeInteractableOnGround(interactable, humanoid));
  }

  lines.push("", "Choose your next action.");
  return lines.filter((x) => x !== null).join("\n");
}

export function describeMovement(humanoid: Humanoid): string {
  const gait = humanoid.running ? "running" : "walking";
  if (humanoid.followName)
    return `You are ${gait} toward ${humanoid.followName} in ${roomOf(humanoid.x, humanoid.y).promptName}.`;
  if (humanoid.target) {
    // the path's final waypoint identifies the destination room
    const end =
      humanoid.pendingPath.length > 0
        ? humanoid.pendingPath[humanoid.pendingPath.length - 1]!
        : humanoid.target;
    return `You are ${gait} to ${roomOf(end.x, end.y).promptName} from ${roomOf(humanoid.x, humanoid.y).promptName}.`;
  }
  return `You are standing still in ${roomOf(humanoid.x, humanoid.y).promptName}.`;
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
