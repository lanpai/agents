import { BODY_PARTS, Humanoid, type BodyPart } from "./humanoid";
import { createItem } from "./interactables";
import type { Item } from "./interactables/types";

const STORAGE_KEY = "sim.humanoids";
const ITEMS_KEY = "sim.items";

type SavedHumanoid = {
  name: string;
  description: string;
  x: number;
  y: number;
  target: { x: number; y: number } | null;
  followName: string | null;
  memory: string[];
  longMemory: string;
  unconsolidated: string[];
  body: Record<BodyPart, number>;
  stamina: number;
  dead: boolean;
  running: boolean;
  voicePitch: number;
};

type SavedItem = {
  name: string;
  x: number;
  y: number;
  holder: string | null;
};

export function saveItems(items: Item[]) {
  const data: SavedItem[] = items.map((item) => ({
    name: item.name,
    // for held items, remember the holder's position as a drop fallback
    x: item.droppedPosition?.x ?? item.holder?.x ?? 0,
    y: item.droppedPosition?.y ?? item.holder?.y ?? 0,
    holder: item.holder?.name ?? null,
  }));
  try {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(data));
  } catch {
    // storage full or unavailable — the sim just won't persist
  }
}

export function loadItems(humanoids: Humanoid[]): Item[] {
  try {
    const raw = localStorage.getItem(ITEMS_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const items: Item[] = [];
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
      if (typeof saved.holder === "string") {
        const holder = humanoids.find(
          (humanoid) => humanoid.name === saved.holder,
        );
        // a holder that no longer exists leaves the item dropped at the saved spot
        if (holder) {
          item.holder = holder;
          item.droppedPosition = null;
        }
      }
      items.push(item);
    }
    return items;
  } catch {
    return [];
  }
}

export function saveHumanoids(humanoids: Humanoid[]) {
  const data: SavedHumanoid[] = humanoids.map((humanoid) => ({
    name: humanoid.name,
    description: humanoid.description,
    x: humanoid.x,
    y: humanoid.y,
    target: humanoid.target,
    followName: humanoid.followName,
    memory: humanoid.memory,
    longMemory: humanoid.longMemory,
    unconsolidated: humanoid.unconsolidated,
    body: humanoid.body,
    stamina: humanoid.stamina,
    dead: humanoid.dead,
    running: humanoid.running,
    voicePitch: humanoid.voicePitch,
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
    typeof saved.name !== "string" ||
    typeof saved.description !== "string" ||
    typeof saved.x !== "number" ||
    typeof saved.y !== "number"
  ) {
    return null;
  }
  const humanoid = new Humanoid(
    saved.name,
    saved.description,
    saved.x,
    saved.y,
  );
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
  humanoid.dead = saved.dead === true;
  humanoid.running = saved.running === true;
  if (typeof saved.voicePitch === "number") {
    humanoid.voicePitch = saved.voicePitch;
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
