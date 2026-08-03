import { Room } from "./types";

export const upstairsWorkArea = new Room({
  name: "Upstairs Work Area",
  promptName: "the upstairs work area",
  x: -400,
  y: -150,
  w: 200,
  h: 150,
  doors: ["Kitchen", "Games Team Area"],
  interactables: [],
});
