import {
  BODY_PARTS,
  Humanoid,
  TEMPERATURES,
  type BodyPart,
  type Temperature,
} from "./humanoid";

const STORAGE_KEY = "sim.humanoids";

type SavedHumanoid = {
  name: string;
  personality: string;
  x: number;
  y: number;
  target: { x: number; y: number } | null;
  followName: string | null;
  memory: string[];
  longMemory: string;
  unconsolidated: string[];
  temperature: Temperature;
  body: Record<BodyPart, number>;
  stamina: number;
  dead: boolean;
  running: boolean;
  inventory: string[];
};

export function saveHumanoids(humanoids: Humanoid[]) {
  const data: SavedHumanoid[] = humanoids.map((humanoid) => ({
    name: humanoid.name,
    personality: humanoid.personality,
    x: humanoid.x,
    y: humanoid.y,
    target: humanoid.target,
    followName: humanoid.followName,
    memory: humanoid.memory,
    longMemory: humanoid.longMemory,
    unconsolidated: humanoid.unconsolidated,
    temperature: humanoid.temperature,
    body: humanoid.body,
    stamina: humanoid.stamina,
    dead: humanoid.dead,
    running: humanoid.running,
    inventory: humanoid.inventory,
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
    typeof saved.personality !== "string" ||
    typeof saved.x !== "number" ||
    typeof saved.y !== "number"
  ) {
    return null;
  }
  const humanoid = new Humanoid(
    saved.name,
    saved.personality,
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
  if (
    saved.temperature &&
    (TEMPERATURES as readonly string[]).includes(saved.temperature)
  ) {
    humanoid.temperature = saved.temperature;
  }
  for (const part of BODY_PARTS) {
    const health = saved.body?.[part];
    if (typeof health === "number") humanoid.body[part] = clamp(health);
  }
  if (typeof saved.stamina === "number")
    humanoid.stamina = clamp(saved.stamina);
  humanoid.dead = saved.dead === true;
  humanoid.running = saved.running === true;
  humanoid.inventory = onlyStrings(saved.inventory);
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
