import { Room } from "./types";

export const arcadeRoom = new Room({
  name: "Arcade Room",
  promptName: "the arcade room",
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  doors: ["Game Room", "Conference Room", "Downstairs Work Area"],
  interactables: [],
});
