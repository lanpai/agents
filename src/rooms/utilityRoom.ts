import { Room } from "./types";

export const utilityRoom = new Room({
  name: "Utility Room",
  promptName: "the utility room",
  x: 90,
  y: -250,
  w: 150,
  h: 90,
  doors: ["North Hall"],
});
