import { arcadeRoom } from "./arcadeRoom";
import { downstairsWorkArea } from "./downstairsWorkArea";
import { conferenceRoom } from "./conferenceRoom";
import { gameRoom } from "./gameRoom";
import { kitchen } from "./kitchen";
import type { Room } from "./types";
import { upstairsWorkArea } from "./upstairsWorkArea";
import { gamesTeamArea } from "./gamesTeamArea";
import { upstairsOffice } from "./upstairsOffice";

export { Room } from "./types";

// rooms are flush axis-aligned rectangles; any two connected rooms must share
// a wall segment for the door to sit on. Interactables declared per room are
// the world's initial state — persistence overrides them when a save exists.
// Order matters: roomOf resolves boundary points to the first containing room.
export const ROOMS: Room[] = [
  arcadeRoom,
  conferenceRoom,
  gameRoom,
  downstairsWorkArea,
  kitchen,
  upstairsWorkArea,
  gamesTeamArea,
  upstairsOffice,
];
