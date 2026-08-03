import { Room } from "./types";

export const kitchen = new Room({
  name: "Kitchen",
  promptName: "the upstairs kitchen",
  x: -200,
  y: -150,
  w: 200,
  h: 150,
  doors: ["Downstairs Work Area", "Upstairs Work Area", "Upstairs Office"],
  interactables: [],
});
