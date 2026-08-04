import { characterByName } from "./characters";
import { createStatus } from "./statuses";
import {
  BODY_PARTS,
  Humanoid,
  type BodyPart,
  type Facing,
} from "./humanoid";
import { createItem } from "./interactables";
import { Item } from "./interactables/types";
import { ROOMS, roomOf } from "./locations";

const STORAGE_KEY = "sim.humanoids";
const ITEMS_KEY = "sim.items";

type SavedHumanoid = {
  // characters carry functions, so only the name is saved and the full
  // Character is re-resolved from the registry on load
  character: string;
  x: number;
  y: number;
  target: { x: number; y: number } | null;
  followName: string | null;
  memory: string[];
  longMemory: string;
  unconsolidated: string[];
  body: Record<BodyPart, number>;
  stamina: number;
  anger: number;
  angerFloor: number;
  temper: number;
  hasKilled: boolean;
  killCommitted: boolean;
  // Maps don't survive JSON, so the grudge ledger is stored as name/value pairs
  grudge: [string, number][];
  dead: boolean;
  escaped: boolean;
  facing: Facing; // kept so a corpse lies the way it fell
  running: boolean;
  // statuses rebuild from the registry by name; durationLeft carries the
  // remaining time for timed statuses, target the victim/meeting partner of
  // targeted ones — the dealt roles must survive a reload
  statuses: { name: string; durationLeft: number | null; target?: string | null }[];
};

type SavedItem = {
  name: string;
  x: number;
  y: number;
  holder: string | null;
};

// items are gathered from the rooms (floor) and the humanoids (carried)
export function saveItems(humanoids: Humanoid[]) {
  const data: SavedItem[] = [];
  for (const room of ROOMS) {
    for (const interactable of room.interactables) {
      if (!(interactable instanceof Item)) continue;
      data.push({
        name: interactable.name,
        x: interactable.position?.x ?? 0,
        y: interactable.position?.y ?? 0,
        holder: null,
      });
    }
  }
  for (const humanoid of humanoids) {
    for (const item of humanoid.carrying) {
      // the holder's position is the drop fallback if they vanish from a save
      data.push({
        name: item.name,
        x: humanoid.x,
        y: humanoid.y,
        holder: humanoid.character.name,
      });
    }
  }
  try {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(data));
  } catch {
    // storage full or unavailable — the sim just won't persist
  }
}

// places saved items into rooms/carrying; a valid save replaces the seed
// items declared in src/rooms
export function loadItems(humanoids: Humanoid[]) {
  try {
    const raw = localStorage.getItem(ITEMS_KEY);
    if (!raw) return;
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return;
    for (const room of ROOMS) {
      room.interactables = room.interactables.filter(
        (interactable) => !(interactable instanceof Item),
      );
    }
    for (const humanoid of humanoids) humanoid.carrying = [];
    for (const entry of data) {
      const saved = entry as Partial<SavedItem> | null;
      if (
        !saved ||
        typeof saved.name !== "string" ||
        typeof saved.x !== "number" ||
        typeof saved.y !== "number"
      ) {
        continue;
      }
      const item = createItem(saved.name, saved.x, saved.y);
      if (!item) continue;
      const holder =
        typeof saved.holder === "string"
          ? humanoids.find(
              (humanoid) => humanoid.character.name === saved.holder,
            )
          : undefined;
      if (holder) {
        item.position = null;
        holder.carrying.push(item);
      } else {
        // a holder that no longer exists leaves the item dropped at the saved spot
        roomOf(saved.x, saved.y).interactables.push(item);
      }
    }
  } catch {
    // unreadable save — keep the seeded defaults
  }
}

export function saveHumanoids(humanoids: Humanoid[]) {
  const data: SavedHumanoid[] = humanoids.map((humanoid) => ({
    character: humanoid.character.name,
    x: humanoid.x,
    y: humanoid.y,
    target: humanoid.target,
    followName: humanoid.followName,
    memory: humanoid.memory,
    longMemory: humanoid.longMemory,
    unconsolidated: humanoid.unconsolidated,
    body: humanoid.body,
    stamina: humanoid.stamina,
    anger: humanoid.anger,
    angerFloor: humanoid.angerFloor,
    temper: humanoid.temper,
    hasKilled: humanoid.hasKilled,
    killCommitted: humanoid.killCommitted,
    grudge: [...humanoid.grudge.entries()],
    dead: humanoid.dead,
    escaped: humanoid.escaped,
    facing: humanoid.facing,
    running: humanoid.running,
    statuses: [...humanoid.statuses.values()].map((status) => {
      const state = status as { durationLeft?: number; target?: string };
      return {
        name: status.name,
        durationLeft:
          typeof state.durationLeft === "number" ? state.durationLeft : null,
        target: typeof state.target === "string" ? state.target : null,
      };
    }),
  }));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage full or unavailable — the sim just won't persist
  }
}

export function loadHumanoids(): Humanoid[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .map(restore)
      .filter((humanoid): humanoid is Humanoid => humanoid !== null);
  } catch {
    return [];
  }
}

function restore(entry: unknown): Humanoid | null {
  const saved = entry as Partial<SavedHumanoid> | null;
  if (
    !saved ||
    typeof saved.character !== "string" ||
    typeof saved.x !== "number" ||
    typeof saved.y !== "number"
  ) {
    return null;
  }
  // a saved humanoid whose character no longer exists can't be reconstructed
  const character = characterByName(saved.character);
  if (!character) return null;
  const humanoid = new Humanoid(character, saved.x, saved.y);
  if (
    saved.target &&
    typeof saved.target.x === "number" &&
    typeof saved.target.y === "number"
  ) {
    humanoid.target = { x: saved.target.x, y: saved.target.y };
  }
  if (typeof saved.followName === "string")
    humanoid.followName = saved.followName;
  if (typeof saved.longMemory === "string")
    humanoid.longMemory = saved.longMemory;
  humanoid.memory = onlyStrings(saved.memory);
  humanoid.unconsolidated = onlyStrings(saved.unconsolidated);
  for (const part of BODY_PARTS) {
    const health = saved.body?.[part];
    if (typeof health === "number") humanoid.body[part] = clamp(health);
  }
  if (typeof saved.stamina === "number")
    humanoid.stamina = clamp(saved.stamina);
  if (typeof saved.anger === "number") humanoid.anger = clamp(saved.anger);
  if (typeof saved.angerFloor === "number")
    humanoid.angerFloor = clamp(saved.angerFloor);
  // a run that already had its murder must not start hunting for a new killer
  humanoid.hasKilled = saved.hasKilled === true;
  // a save from before this flag existed: a body on the floor is proof enough
  humanoid.killCommitted = saved.killCommitted === true || humanoid.hasKilled;
  // a re-rolled temper would reshuffle who is about to snap mid-run
  if (typeof saved.temper === "number" && saved.temper > 0)
    humanoid.temper = saved.temper;
  if (Array.isArray(saved.grudge)) {
    for (const pair of saved.grudge) {
      if (Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "number") {
        humanoid.grudge.set(pair[0], pair[1]);
      }
    }
  }
  if (
    saved.facing === "front" ||
    saved.facing === "back" ||
    saved.facing === "left" ||
    saved.facing === "right"
  ) {
    humanoid.facing = saved.facing;
  }
  humanoid.dead = saved.dead === true;
  humanoid.escaped = saved.escaped === true;
  // a body restored from a save died some time ago: its pool is already full
  if (humanoid.dead) {
    humanoid.deadFor = 3600;
    // the corpse is the last frame of its collapse — re-pose the one-shot
    // already finished, so it draws the body without re-freezing the room
    const stabbed = character.sprite.stabbed;
    humanoid.action = {
      kind: "stabbed",
      facing: humanoid.facing,
      t: stabbed.frames * stabbed.frameMs,
    };
  }
  humanoid.running = saved.running === true;
  if (Array.isArray(saved.statuses)) {
    for (const entry of saved.statuses) {
      if (!entry || typeof entry.name !== "string") continue;
      const status = createStatus(entry.name, humanoid);
      if (!status) continue; // status type no longer exists
      if (typeof entry.durationLeft === "number") {
        (status as { durationLeft?: number }).durationLeft =
          entry.durationLeft;
      }
      if (typeof entry.target === "string" && entry.target.length > 0) {
        (status as { target?: string }).target = entry.target;
      }
      humanoid.statuses.set(status.name, status);
    }
  }
  return humanoid;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function onlyStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
