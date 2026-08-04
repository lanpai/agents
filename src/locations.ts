import { ROOMS, Room } from "./rooms";
import { floorPattern, hashSeed, mulberry32, PALETTE } from "./theme";

// geometry helpers over the rooms defined in src/rooms; re-exported so
// existing imports keep working
export { ROOMS, Room };

const DOOR_WIDTH = 24;

export function roomByName(name: string): Room | undefined {
  return ROOMS.find((room) => room.name === name);
}

export function roomCenter(room: Room): { x: number; y: number } {
  return { x: room.x + room.w / 2, y: room.y + room.h / 2 };
}

export function randomPointInRoom(
  room: Room,
  margin = 20,
): { x: number; y: number } {
  const marginX = Math.min(margin, room.w / 2);
  const marginY = Math.min(margin, room.h / 2);
  return {
    x: room.x + marginX + Math.random() * (room.w - marginX * 2),
    y: room.y + marginY + Math.random() * (room.h - marginY * 2),
  };
}

// the room containing the point; falls back to the nearest room center for
// positions momentarily on an edge or outside the house
export function roomOf(x: number, y: number): Room {
  const containing = ROOMS.find(
    (room) =>
      x >= room.x &&
      x <= room.x + room.w &&
      y >= room.y &&
      y <= room.y + room.h,
  );
  if (containing) return containing;
  let nearest = ROOMS[0]!;
  let best = Number.POSITIVE_INFINITY;
  for (const room of ROOMS) {
    const center = roomCenter(room);
    const distance = Math.hypot(x - center.x, y - center.y);
    if (distance < best) {
      best = distance;
      nearest = room;
    }
  }
  return nearest;
}

// BFS over the door graph; returns the room names from start to destination
// (inclusive), or null when no sequence of doors connects them
export function findPath(from: Room, to: Room): string[] | null {
  if (from === to) return [from.name];
  const previous = new Map<string, string>();
  const seen = new Set([from.name]);
  const queue = [from.name];
  while (queue.length > 0) {
    const name = queue.shift()!;
    for (const doorName of roomByName(name)?.doors ?? []) {
      if (seen.has(doorName)) continue;
      seen.add(doorName);
      previous.set(doorName, name);
      if (doorName === to.name) {
        const path = [to.name];
        let current = to.name;
        while (current !== from.name) {
          current = previous.get(current)!;
          path.unshift(current);
        }
        return path;
      }
      queue.push(doorName);
    }
  }
  return null;
}

// the overlap segment between two touching rectangles collapses to the shared
// wall on one axis; its midpoint is where the door sits
export function doorBetween(a: Room, b: Room): { x: number; y: number } {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

// a deterministic point on the door's wall-normal axis, a short depth into
// the given room (clamped so narrow halls still keep it inside)
function doorOffset(
  from: Room,
  to: Room,
  into: Room,
): { x: number; y: number } {
  const door = doorBetween(from, to);
  const center = roomCenter(into);
  const overlapX =
    Math.min(from.x + from.w, to.x + to.w) - Math.max(from.x, to.x);
  const overlapY =
    Math.min(from.y + from.h, to.y + to.h) - Math.max(from.y, to.y);
  if (overlapX < overlapY) {
    // vertical shared wall: offset along x
    const depth = Math.min(24, into.w / 2 - 4);
    return { x: door.x + Math.sign(center.x - door.x) * depth, y: door.y };
  }
  const depth = Math.min(24, into.h / 2 - 4);
  return { x: door.x, y: door.y + Math.sign(center.y - door.y) * depth };
}

// every doorway center, computed once — collision switches off near these so
// two humanoids meeting in a door squeeze past instead of deadlocking
const DOOR_POINTS: { x: number; y: number }[] = [];
for (const room of ROOMS) {
  for (const name of room.doors) {
    const other = roomByName(name);
    if (!other) continue;
    const door = doorBetween(room, other);
    if (
      !DOOR_POINTS.some((point) => point.x === door.x && point.y === door.y)
    ) {
      DOOR_POINTS.push(door);
    }
  }
}

export function nearDoor(x: number, y: number, radius: number): boolean {
  return DOOR_POINTS.some(
    (door) => Math.hypot(door.x - x, door.y - y) < radius,
  );
}

// staging point in front of a door, inside the room being left — walking here
// first lines the humanoid up so it never slides along the wall into the gap
export function doorApproach(from: Room, to: Room): { x: number; y: number } {
  return doorOffset(from, to, from);
}

// the mirror point just inside the next room
export function doorThrough(from: Room, to: Room): { x: number; y: number } {
  return doorOffset(from, to, to);
}

// where you end up after stepping through the door from one room to the next:
// a short random distance inside, with a little sideways scatter
export function doorLanding(from: Room, to: Room): { x: number; y: number } {
  const door = doorBetween(from, to);
  const center = roomCenter(to);
  const overlapX =
    Math.min(from.x + from.w, to.x + to.w) - Math.max(from.x, to.x);
  const overlapY =
    Math.min(from.y + from.h, to.y + to.h) - Math.max(from.y, to.y);
  const depth = 24 + Math.random() * 36;
  const lateral = (Math.random() - 0.5) * 48;
  const point =
    overlapX < overlapY
      ? // vertical shared wall: step inward along x
        {
          x: door.x + Math.sign(center.x - door.x) * depth,
          y: door.y + lateral,
        }
      : {
          x: door.x + lateral,
          y: door.y + Math.sign(center.y - door.y) * depth,
        };
  return {
    x: Math.min(Math.max(point.x, to.x + 12), to.x + to.w - 12),
    y: Math.min(Math.max(point.y, to.y + 12), to.y + to.h - 12),
  };
}

// wall band straddling each room edge: half of it sits inside the room, which
// is why nothing is ever placed within 12 units of a wall (see doorLanding)
const WALL = 8;
// how far a wall's shadow reaches across the floor
const SHADOW_DEPTH = 18;

// pools of warm ceiling light on the floor — deterministic per room so they
// don't crawl between frames
function drawLightPools(ctx: CanvasRenderingContext2D, room: Room) {
  const random = mulberry32(hashSeed(room.name));
  const count = 2 + Math.floor((room.w * room.h) / 40000);
  ctx.save();
  ctx.beginPath();
  ctx.rect(room.x, room.y, room.w, room.h);
  ctx.clip();
  for (let i = 0; i < count; i++) {
    const x = room.x + room.w * (0.15 + random() * 0.7);
    const y = room.y + room.h * (0.15 + random() * 0.7);
    const radius = Math.min(room.w, room.h) * (0.45 + random() * 0.45);
    const pool = ctx.createRadialGradient(x, y, 0, x, y, radius);
    pool.addColorStop(0, PALETTE.light);
    pool.addColorStop(1, "rgba(255, 216, 158, 0)");
    ctx.fillStyle = pool;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  ctx.restore();
}

// the dark the walls throw inward, which is what gives the flat top-down view
// its sense of height
function drawWallShadow(ctx: CanvasRenderingContext2D, room: Room) {
  const right = room.x + room.w;
  const bottom = room.y + room.h;
  // each entry runs from the wall inward: [x0, y0, x1, y1, fill rect]
  const edges: [number, number, number, number, number[]][] = [
    [room.x, room.y, room.x, room.y + SHADOW_DEPTH, [room.x, room.y, room.w, SHADOW_DEPTH]],
    [room.x, bottom, room.x, bottom - SHADOW_DEPTH, [room.x, bottom - SHADOW_DEPTH, room.w, SHADOW_DEPTH]],
    [room.x, room.y, room.x + SHADOW_DEPTH, room.y, [room.x, room.y, SHADOW_DEPTH, room.h]],
    [right, room.y, right - SHADOW_DEPTH, room.y, [right - SHADOW_DEPTH, room.y, SHADOW_DEPTH, room.h]],
  ];
  for (const [x0, y0, x1, y1, rect] of edges) {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, PALETTE.wallShadow);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(rect[0]!, rect[1]!, rect[2]!, rect[3]!);
  }
}

// the rectangle a doorway occupies within the wall band
function doorRect(
  room: Room,
  other: Room,
): { x: number; y: number; w: number; h: number; vertical: boolean } {
  const door = doorBetween(room, other);
  const overlapX =
    Math.min(room.x + room.w, other.x + other.w) - Math.max(room.x, other.x);
  const overlapY =
    Math.min(room.y + room.h, other.y + other.h) - Math.max(room.y, other.y);
  const vertical = overlapX < overlapY; // the shared wall runs north-south
  return vertical
    ? {
        x: door.x - WALL / 2,
        y: door.y - DOOR_WIDTH / 2,
        w: WALL,
        h: DOOR_WIDTH,
        vertical,
      }
    : {
        x: door.x - DOOR_WIDTH / 2,
        y: door.y - WALL / 2,
        w: DOOR_WIDTH,
        h: WALL,
        vertical,
      };
}

export function drawHouse(ctx: CanvasRenderingContext2D) {
  ctx.save();

  // floors, then the light on them, then the shadow the walls cast over both
  for (const room of ROOMS) {
    ctx.fillStyle = floorPattern(ctx, room.floor);
    ctx.fillRect(room.x, room.y, room.w, room.h);
  }
  for (const room of ROOMS) drawLightPools(ctx, room);
  for (const room of ROOMS) drawWallShadow(ctx, room);

  // walls: one band centred on every room edge, so shared walls between two
  // rooms land on the same line and merge into a single wall
  ctx.lineJoin = "miter";
  for (const room of ROOMS) {
    ctx.strokeStyle = PALETTE.wall;
    ctx.lineWidth = WALL;
    ctx.strokeRect(room.x, room.y, room.w, room.h);
  }
  for (const room of ROOMS) {
    // dark outer seam and a lit lip on the room side, in that order
    ctx.strokeStyle = PALETTE.wallEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(
      room.x - WALL / 2,
      room.y - WALL / 2,
      room.w + WALL,
      room.h + WALL,
    );
    ctx.strokeStyle = PALETTE.wallLip;
    ctx.strokeRect(
      room.x + WALL / 2,
      room.y + WALL / 2,
      room.w - WALL,
      room.h - WALL,
    );
  }

  // doorways: cut the wall band and glaze the opening
  for (const room of ROOMS) {
    for (const doorName of room.doors) {
      const other = roomByName(doorName);
      if (!other || other.name < room.name) continue; // draw each pair once
      const { x, y, w, h, vertical } = doorRect(room, other);
      ctx.fillStyle = PALETTE.doorBase;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = PALETTE.doorGlass;
      ctx.fillRect(x, y, w, h);
      // frame posts at the jambs, and the seam where the two leaves meet
      ctx.fillStyle = PALETTE.doorFrame;
      if (vertical) {
        ctx.fillRect(x, y, w, 1);
        ctx.fillRect(x, y + h - 1, w, 1);
        ctx.fillRect(x + w / 2 - 0.5, y + 2, 1, h - 4);
      } else {
        ctx.fillRect(x, y, 1, h);
        ctx.fillRect(x + w - 1, y, 1, h);
        ctx.fillRect(x + 2, y + h / 2 - 0.5, w - 4, 1);
      }
    }
  }

  // room names in the top-left corner of each room, just inside the wall —
  // small tracked-out caps, outlined so they read over any floor material
  ctx.font = "7px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.letterSpacing = "1px"; // ignored by engines that don't support it
  ctx.lineJoin = "round";
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = PALETTE.labelShadow;
  const lineHeight = 9;
  const inset = WALL / 2 + 4; // clear the wall band, then a little breathing room
  for (const room of ROOMS) {
    const maxWidth = room.w - inset * 2;
    const lines = wrapText(ctx, room.name.toUpperCase(), maxWidth);
    lines.forEach((line, i) => {
      const x = room.x + inset;
      const y = room.y + inset + i * lineHeight;
      ctx.strokeText(line, x, y, maxWidth);
      ctx.fillStyle = PALETTE.label;
      ctx.fillText(line, x, y, maxWidth);
    });
  }
  ctx.letterSpacing = "0px";

  ctx.restore();
}

// greedy word wrap using the canvas's current font; a single word wider than
// maxWidth still gets its own line (fillText's maxWidth condenses it instead)
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}
