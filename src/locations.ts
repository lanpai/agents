export type Room = {
  name: string;
  x: number; // center
  y: number;
  size: number;
  doors: string[]; // adjacent rooms reachable through a door
};

const S = 160; // room size; rooms sit flush on a 3x3 grid
const DOOR_WIDTH = 32;

export const ROOMS: Room[] = [
  { name: "Kitchen", x: -S, y: -S, size: S, doors: ["Living Room", "Dining Room"] },
  { name: "Living Room", x: 0, y: -S, size: S, doors: ["Kitchen", "Study", "Hall"] },
  { name: "Study", x: S, y: -S, size: S, doors: ["Living Room", "Library"] },
  { name: "Dining Room", x: -S, y: 0, size: S, doors: ["Kitchen", "Hall", "Pantry"] },
  { name: "Hall", x: 0, y: 0, size: S, doors: ["Living Room", "Dining Room", "Library", "Foyer"] },
  { name: "Library", x: S, y: 0, size: S, doors: ["Study", "Hall", "Bedroom"] },
  { name: "Pantry", x: -S, y: S, size: S, doors: ["Dining Room", "Foyer"] },
  { name: "Foyer", x: 0, y: S, size: S, doors: ["Hall", "Pantry", "Bedroom"] },
  { name: "Bedroom", x: S, y: S, size: S, doors: ["Library", "Foyer"] },
];

export function roomByName(name: string): Room | undefined {
  return ROOMS.find((room) => room.name === name);
}

// the room containing the point; falls back to the nearest room center for
// positions momentarily on an edge or outside the house
export function roomOf(x: number, y: number): Room {
  const containing = ROOMS.find(
    (room) =>
      Math.abs(x - room.x) <= room.size / 2 && Math.abs(y - room.y) <= room.size / 2,
  );
  if (containing) return containing;
  let nearest = ROOMS[0]!;
  let best = Number.POSITIVE_INFINITY;
  for (const room of ROOMS) {
    const distance = Math.hypot(x - room.x, y - room.y);
    if (distance < best) {
      best = distance;
      nearest = room;
    }
  }
  return nearest;
}

// rooms are equal flush squares, so the shared wall midpoint is halfway between centers
export function doorBetween(a: Room, b: Room): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function drawHouse(ctx: CanvasRenderingContext2D) {
  ctx.save();

  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.lineWidth = 2;
  for (const room of ROOMS) {
    ctx.strokeRect(room.x - room.size / 2, room.y - room.size / 2, room.size, room.size);
  }

  // door openings: paint a white gap over the shared wall
  ctx.fillStyle = "#fff";
  for (const room of ROOMS) {
    for (const doorName of room.doors) {
      const other = roomByName(doorName);
      if (!other || other.name < room.name) continue; // draw each pair once
      const door = doorBetween(room, other);
      if (room.y === other.y) {
        ctx.fillRect(door.x - 3, door.y - DOOR_WIDTH / 2, 6, DOOR_WIDTH);
      } else {
        ctx.fillRect(door.x - DOOR_WIDTH / 2, door.y - 3, DOOR_WIDTH, 6);
      }
    }
  }

  ctx.font = "18px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
  for (const room of ROOMS) {
    ctx.fillText(room.name, room.x, room.y);
  }

  ctx.restore();
}
