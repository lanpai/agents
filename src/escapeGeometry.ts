import type { Room } from "./rooms/types";

export type EscapeSide = "north" | "south" | "west" | "east";

export type EscapeRoute = {
  roomName: string;
  side: EscapeSide;
  x: number;
  y: number;
};

const DOOR_WIDTH = 24;
const CORNER_CLEARANCE = 10;

type Interval = { from: number; to: number };

function uncoveredIntervals(edge: Interval, blocked: Interval[]): Interval[] {
  let open = [edge];
  for (const block of blocked) {
    const next: Interval[] = [];
    for (const interval of open) {
      if (block.to <= interval.from || block.from >= interval.to) {
        next.push(interval);
        continue;
      }
      if (block.from > interval.from)
        next.push({ from: interval.from, to: block.from });
      if (block.to < interval.to)
        next.push({ from: block.to, to: interval.to });
    }
    open = next;
  }
  return open.filter(
    (interval) => interval.to - interval.from >= DOOR_WIDTH + CORNER_CLEARANCE * 2,
  );
}

function touchingIntervals(
  room: Room,
  side: EscapeSide,
  rooms: Room[],
): Interval[] {
  const horizontal = side === "north" || side === "south";
  const edge =
    side === "north"
      ? room.y
      : side === "south"
        ? room.y + room.h
        : side === "west"
          ? room.x
          : room.x + room.w;
  return rooms
    .filter((other) => {
      if (other === room) return false;
      if (side === "north") return other.y + other.h === edge;
      if (side === "south") return other.y === edge;
      if (side === "west") return other.x + other.w === edge;
      return other.x === edge;
    })
    .map((other) =>
      horizontal
        ? {
            from: Math.max(room.x, other.x),
            to: Math.min(room.x + room.w, other.x + other.w),
          }
        : {
            from: Math.max(room.y, other.y),
            to: Math.min(room.y + room.h, other.y + other.h),
          },
    )
    .filter((interval) => interval.to > interval.from);
}

// Every returned position is on a genuinely exposed part of a room wall,
// rather than a wall shared with another room.
export function escapeDoorCandidates(rooms: Room[]): EscapeRoute[] {
  const candidates: EscapeRoute[] = [];
  for (const room of rooms) {
    for (const side of ["north", "south", "west", "east"] as const) {
      const horizontal = side === "north" || side === "south";
      const edge = horizontal
        ? { from: room.x, to: room.x + room.w }
        : { from: room.y, to: room.y + room.h };
      const gaps = uncoveredIntervals(
        edge,
        touchingIntervals(room, side, rooms),
      );
      for (const gap of gaps) {
        const center = (gap.from + gap.to) / 2;
        candidates.push({
          roomName: room.name,
          side,
          x:
            side === "west"
              ? room.x
              : side === "east"
                ? room.x + room.w
                : center,
          y:
            side === "north"
              ? room.y
              : side === "south"
                ? room.y + room.h
                : center,
        });
      }
    }
  }
  return candidates;
}
