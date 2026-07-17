import { Room } from "./types";

export const refrigeratorRoom = new Room({
  name: "Refrigerator Room",
  promptName: "the refrigerator room",
  x: 90,
  y: -310,
  w: 150,
  h: 60,
  doors: ["Kitchen"],
});
