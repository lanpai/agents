import type { Shot } from "./cutscene";
import type { Humanoid } from "./humanoid";
import { ROOMS, roomByName } from "./locations";
import {
  escapeDoorCandidates as findEscapeDoorCandidates,
  type EscapeRoute,
} from "./escapeGeometry";
import { simNow } from "./time";

export type { EscapeRoute, EscapeSide } from "./escapeGeometry";

const STORAGE_KEY = "sim.escape-route";
const DOOR_WIDTH = 24;
const WALL = 8;
export const ESCAPE_REVEAL_S = 4.2;

let active: EscapeRoute | null | undefined;

// Every returned position is on a genuinely exposed part of a room wall,
// rather than a wall shared with another room. A room can have several valid
// exterior stretches; the activation roll remains room-first so large rooms
// are not disproportionately likely to receive the exit.
export function escapeDoorCandidates(): EscapeRoute[] {
  return findEscapeDoorCandidates(ROOMS);
}

function validSavedRoute(value: unknown): EscapeRoute | null {
  const saved = value as Partial<EscapeRoute> | null;
  if (
    !saved ||
    typeof saved.roomName !== "string" ||
    !["north", "south", "west", "east"].includes(String(saved.side)) ||
    typeof saved.x !== "number" ||
    typeof saved.y !== "number"
  ) {
    return null;
  }
  return (
    escapeDoorCandidates().find(
      (candidate) =>
        candidate.roomName === saved.roomName &&
        candidate.side === saved.side &&
        candidate.x === saved.x &&
        candidate.y === saved.y,
    ) ?? null
  );
}

export function getEscapeRoute(): EscapeRoute | null {
  if (active !== undefined) return active;
  active = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) active = validSavedRoute(JSON.parse(raw));
  } catch {
    // Storage is optional; the active route still works for this session.
  }
  return active;
}

function escapeRoutePresentation(route: EscapeRoute) {
  const room = roomByName(route.roomName);
  const roomName = room?.promptName ?? route.roomName;
  const upstairs = room?.promptName.includes("(upstairs)") === true;
  return upstairs
    ? {
        hint: `An emergency signal activates: the escape route is the glowing green emergency escape window on the ${route.side} exterior wall of ${roomName}. It opens onto exterior fire-escape stairs leading downstairs and outside.`,
        label: "fire escape unlocked",
        title: `${route.roomName} window`,
      }
    : {
        hint: `An emergency signal activates: the escape route is the glowing green emergency exit door on the ${route.side} exterior wall of ${roomName}. It leads directly outside.`,
        label: "emergency exit unlocked",
        title: `${route.roomName} door`,
      };
}

export function escapeRouteUseLabel(route: EscapeRoute): string {
  const room = roomByName(route.roomName);
  return room?.promptName.includes("(upstairs)")
    ? "emergency escape window and exterior fire-escape stairs"
    : "emergency exit door";
}

export function activateEscapeRoute(
  world: Humanoid[],
  killer?: Humanoid,
): EscapeRoute | null {
  const existing = getEscapeRoute();
  if (existing) return existing;

  const byRoom = new Map<string, EscapeRoute[]>();
  for (const candidate of escapeDoorCandidates()) {
    const routes = byRoom.get(candidate.roomName) ?? [];
    routes.push(candidate);
    byRoom.set(candidate.roomName, routes);
  }
  const eligibleRooms = [...byRoom.keys()];
  const roomName = eligibleRooms[Math.floor(Math.random() * eligibleRooms.length)];
  if (!roomName) return null;
  const routes = byRoom.get(roomName)!;
  active = routes[Math.floor(Math.random() * routes.length)] ?? null;
  if (!active) return null;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
  } catch {
    // Storage is optional; the active route still works for this session.
  }

  const hint = escapeRoutePresentation(active).hint;
  const alarm = `You heard a sudden scream echo through the building. Something is seriously wrong, but from the sound alone you cannot tell exactly what happened. ${hint}`;
  for (const humanoid of world) {
    if (humanoid.dead || humanoid.escaped) continue;
    // The killer already knows what caused the scream. They still need the
    // actionable escape-route reveal, but not the deliberately vague alarm.
    humanoid.remember(humanoid === killer ? hint : alarm);
    humanoid.nextThinkAt = Math.min(humanoid.nextThinkAt, simNow() + 500);
  }
  return active;
}

export function escapeRouteShot(): Shot | null {
  const route = getEscapeRoute();
  if (!route) return null;
  const presentation = escapeRoutePresentation(route);
  return {
    x: route.x,
    y: route.y,
    zoomFrom: 4.2,
    zoomTo: 5.8,
    duration: ESCAPE_REVEAL_S,
    label: presentation.label,
    title: presentation.title,
  };
}

export function drawEscapeRoute(
  ctx: CanvasRenderingContext2D,
  now: number,
) {
  const route = getEscapeRoute();
  if (!route) return;
  const vertical = route.side === "west" || route.side === "east";
  const x = route.x - (vertical ? WALL / 2 : DOOR_WIDTH / 2);
  const y = route.y - (vertical ? DOOR_WIDTH / 2 : WALL / 2);
  const w = vertical ? WALL : DOOR_WIDTH;
  const h = vertical ? DOOR_WIDTH : WALL;
  const pulse = 0.5 + 0.5 * Math.sin(now / 220);

  ctx.save();
  ctx.shadowColor = "#43ff83";
  ctx.shadowBlur = 10 + pulse * 12;
  ctx.fillStyle = `rgba(45, 255, 115, ${0.7 + pulse * 0.2})`;
  ctx.fillRect(x, y, w, h);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#baffce";
  ctx.strokeRect(x, y, w, h);

  // A small outward chevron makes the door read as an exit, not another
  // interior connection, even when the camera is showing the whole layout.
  const outward = 10 + pulse * 2;
  ctx.beginPath();
  if (route.side === "north") {
    ctx.moveTo(route.x - 5, route.y - outward + 5);
    ctx.lineTo(route.x, route.y - outward);
    ctx.lineTo(route.x + 5, route.y - outward + 5);
  } else if (route.side === "south") {
    ctx.moveTo(route.x - 5, route.y + outward - 5);
    ctx.lineTo(route.x, route.y + outward);
    ctx.lineTo(route.x + 5, route.y + outward - 5);
  } else if (route.side === "west") {
    ctx.moveTo(route.x - outward + 5, route.y - 5);
    ctx.lineTo(route.x - outward, route.y);
    ctx.lineTo(route.x - outward + 5, route.y + 5);
  } else {
    ctx.moveTo(route.x + outward - 5, route.y - 5);
    ctx.lineTo(route.x + outward, route.y);
    ctx.lineTo(route.x + outward - 5, route.y + 5);
  }
  ctx.strokeStyle = "#68ff9d";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}
