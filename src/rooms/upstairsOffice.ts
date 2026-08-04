import { Room } from "./types";

export const upstairsOffice = new Room({
  name: "Upstairs Office",
  promptName: "the upstairs office room (upstairs)",
  x: 0,
  y: -150,
  w: 200,
  h: 75,
  doors: ["Kitchen"],
  interactables: [],
  floor: "wood",
});
