export type Room = {
  name: string;
  promptName: string;
  x: number; // top-left corner
  y: number;
  w: number;
  h: number;
  doors: string[]; // adjacent rooms reachable through a door
};

const DOOR_WIDTH = 24;

// rooms are flush axis-aligned rectangles; any two connected rooms must share
// a wall segment for the door to sit on
export const ROOMS: Room[] = [
  {
    name: "Porch",
    promptName: "the porch",
    x: -420,
    y: -100,
    w: 60,
    h: 80,
    doors: ["Foyer"],
  },
  {
    name: "Foyer",
    promptName: "the foyer",
    x: -360,
    y: -160,
    w: 120,
    h: 200,
    doors: ["Porch", "North Hall", "Library"],
  },
  {
    name: "Library",
    promptName: "the library",
    x: -360,
    y: -310,
    w: 150,
    h: 150,
    doors: ["Foyer"],
  },
  {
    name: "Dining Room",
    promptName: "the dining room",
    x: -210,
    y: -310,
    w: 200,
    h: 150,
    doors: ["North Hall", "Kitchen"],
  },
  {
    name: "Kitchen",
    promptName: "the kitchen",
    x: -10,
    y: -310,
    w: 100,
    h: 150,
    doors: ["Dining Room", "Refrigerator Room"],
  },
  {
    name: "Refrigerator Room",
    promptName: "the refrigerator room",
    x: 90,
    y: -310,
    w: 150,
    h: 60,
    doors: ["Kitchen"],
  },
  {
    name: "Utility Room",
    promptName: "the utility room",
    x: 90,
    y: -250,
    w: 150,
    h: 90,
    doors: ["North Hall"],
  },
  {
    name: "North Hall",
    promptName: "the north hall",
    x: -240,
    y: -160,
    w: 480,
    h: 40,
    doors: ["Foyer", "Dining Room", "South Hall", "Utility Room", "Parlor"],
  },
  {
    name: "Parlor",
    promptName: "the parlor",
    x: 0,
    y: -120,
    w: 240,
    h: 160,
    doors: ["North Hall"],
  },
  {
    name: "South Hall",
    promptName: "the south hall",
    x: -140,
    y: -120,
    w: 40,
    h: 320,
    doors: [
      "North Hall",
      "Evening Whiskey's Room",
      "Second Opinion's Room",
      "Lucky in Love and Old Fashioned's Room",
      "Bedroom 4",
      "Bedroom 5",
      "Bedroom 6",
      "Bedroom 7",
      "Bedroom 8",
    ],
  },
  {
    name: "Evening Whiskey's Room",
    promptName: "Evening Whiskey's room",
    x: -240,
    y: -120,
    w: 100,
    h: 80,
    doors: ["South Hall"],
  },
  {
    name: "Second Opinion's Room",
    promptName: "Second Opinion's room",
    x: -240,
    y: -40,
    w: 100,
    h: 80,
    doors: ["South Hall"],
  },
  {
    name: "Lucky in Love and Old Fashioned's Room",
    promptName: "Lucky in Love and Old Fashioned's room",
    x: -240,
    y: 40,
    w: 100,
    h: 80,
    doors: ["South Hall"],
  },
  {
    name: "Bedroom 4",
    promptName: "bedroom 4",
    x: -240,
    y: 120,
    w: 100,
    h: 80,
    doors: ["South Hall"],
  },

  {
    name: "Bedroom 5",
    promptName: "bedroom 5",
    x: -100,
    y: -120,
    w: 100,
    h: 80,
    doors: ["South Hall"],
  },
  {
    name: "Bedroom 6",
    promptName: "bedroom 6",
    x: -100,
    y: -40,
    w: 100,
    h: 80,
    doors: ["South Hall"],
  },
  {
    name: "Bedroom 7",
    promptName: "bedroom 7",
    x: -100,
    y: 40,
    w: 100,
    h: 80,
    doors: ["South Hall"],
  },
  {
    name: "Bedroom 8",
    promptName: "bedroom 8",
    x: -100,
    y: 120,
    w: 100,
    h: 80,
    doors: ["South Hall"],
  },
];
// export const ROOMS: Room[] = [
//   {
//     name: "Kitchen",
//     x: -240,
//     y: -240,
//     w: 160,
//     h: 160,
//     doors: ["Living Room", "Dining Room"],
//   },
//   {
//     name: "Living Room",
//     x: -80,
//     y: -240,
//     w: 240,
//     h: 160,
//     doors: ["Kitchen", "Study", "Hall"],
//   },
//   {
//     name: "Study",
//     x: 160,
//     y: -240,
//     w: 80,
//     h: 160,
//     doors: ["Living Room", "Library"],
//   },
//   {
//     name: "Dining Room",
//     x: -240,
//     y: -80,
//     w: 160,
//     h: 120,
//     doors: ["Kitchen", "Hall", "Pantry"],
//   },
//   {
//     name: "Hall",
//     x: -80,
//     y: -80,
//     w: 120,
//     h: 120,
//     doors: ["Living Room", "Dining Room", "Library", "Foyer"],
//   },
//   {
//     name: "Library",
//     x: 40,
//     y: -80,
//     w: 200,
//     h: 120,
//     doors: ["Study", "Hall", "Bedroom"],
//   },
//   {
//     name: "Pantry",
//     x: -240,
//     y: 40,
//     w: 100,
//     h: 200,
//     doors: ["Dining Room", "Foyer"],
//   },
//   {
//     name: "Foyer",
//     x: -140,
//     y: 40,
//     w: 180,
//     h: 200,
//     doors: ["Hall", "Pantry", "Bedroom"],
//   },
//   {
//     name: "Bedroom",
//     x: 40,
//     y: 40,
//     w: 200,
//     h: 200,
//     doors: ["Library", "Foyer"],
//   },
// ];

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

export function drawHouse(ctx: CanvasRenderingContext2D) {
  ctx.save();

  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  for (const room of ROOMS) {
    ctx.strokeRect(room.x, room.y, room.w, room.h);
  }

  // door openings: paint a white gap over the shared wall
  ctx.fillStyle = "#fff";
  for (const room of ROOMS) {
    for (const doorName of room.doors) {
      const other = roomByName(doorName);
      if (!other || other.name < room.name) continue; // draw each pair once
      const door = doorBetween(room, other);
      const overlapX =
        Math.min(room.x + room.w, other.x + other.w) -
        Math.max(room.x, other.x);
      const overlapY =
        Math.min(room.y + room.h, other.y + other.h) -
        Math.max(room.y, other.y);
      if (overlapX < overlapY) {
        // vertical shared wall
        ctx.fillRect(door.x - 3, door.y - DOOR_WIDTH / 2, 6, DOOR_WIDTH);
      } else {
        ctx.fillRect(door.x - DOOR_WIDTH / 2, door.y - 3, DOOR_WIDTH, 6);
      }
    }
  }

  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
  const lineHeight = 12;
  for (const room of ROOMS) {
    const center = roomCenter(room);
    const lines = wrapText(ctx, room.name, room.w - 8);
    const startY = center.y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, center.x, startY + i * lineHeight + 1, room.w - 8);
    });
  }

  ctx.restore();
}

// greedy word wrap using the canvas's current font; a single word wider than
// maxWidth still gets its own line (fillText's maxWidth condenses it instead)
function wrapText(
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
