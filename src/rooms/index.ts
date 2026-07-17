import { texasTeasRoom } from "./bedrooms/texasTeasRoom";
import { partingShotsRoom } from "./bedrooms/partingShotsRoom";
import { bedroom6 } from "./bedrooms/bedroom6";
import { bedroom7 } from "./bedrooms/bedroom7";
import { bedroom8 } from "./bedrooms/bedroom8";
import { diningRoom } from "./diningRoom";
import { eveningWhiskeysRoom } from "./bedrooms/eveningWhiskeysRoom";
import { foyer } from "./foyer";
import { kitchen } from "./kitchen";
import { library } from "./library";
import { luckyInLoveAndOldFashionedsRoom } from "./bedrooms/luckyInLoveAndOldFashionedsRoom";
import { northHall } from "./northHall";
import { parlor } from "./parlor";
import { porch } from "./porch";
import { refrigeratorRoom } from "./refrigeratorRoom";
import { secondOpinionsRoom } from "./bedrooms/secondOpinionsRoom";
import { southHall } from "./southHall";
import { utilityRoom } from "./utilityRoom";
import type { Room } from "./types";

export { Room } from "./types";

// rooms are flush axis-aligned rectangles; any two connected rooms must share
// a wall segment for the door to sit on. Interactables declared per room are
// the world's initial state — persistence overrides them when a save exists.
// Order matters: roomOf resolves boundary points to the first containing room.
export const ROOMS: Room[] = [
  porch,
  foyer,
  library,
  diningRoom,
  kitchen,
  refrigeratorRoom,
  utilityRoom,
  northHall,
  parlor,
  southHall,
  eveningWhiskeysRoom,
  secondOpinionsRoom,
  luckyInLoveAndOldFashionedsRoom,
  texasTeasRoom,
  partingShotsRoom,
  bedroom6,
  bedroom7,
  bedroom8,
];
