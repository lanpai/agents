import { Room } from "./types";

export const porch = new Room({
  name: "Porch",
  promptName: "the porch",
  x: -420,
  y: -100,
  w: 60,
  h: 80,
  doors: ["Foyer"],
});
