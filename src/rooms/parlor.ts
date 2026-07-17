import { Room } from "./types";

export const parlor = new Room({
  name: "Parlor",
  promptName: "the parlor",
  x: 0,
  y: -120,
  w: 240,
  h: 160,
  doors: ["North Hall"],
});
