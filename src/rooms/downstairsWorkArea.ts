import { Room } from "./types";

export const downstairsWorkArea = new Room({
  name: "Downstairs Work Area",
  promptName: "the downstairs work area",
  x: -600,
  y: 0,
  w: 600,
  h: 200,
  doors: ["Arcade Room", "Kitchen"],
  interactables: [],
});
