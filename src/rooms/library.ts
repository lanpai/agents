import { Room } from "./types";

export const library = new Room({
  name: "Library",
  promptName: "the library",
  x: -360,
  y: -310,
  w: 150,
  h: 150,
  doors: ["Foyer"],
});
