import { Room } from "./types";

export const gameRoom = new Room({
  name: "Game Room",
  promptName: "the game room",
  x: 0,
  y: -75,
  w: 100,
  h: 75,
  doors: ["Arcade Room"],
  interactables: [],
});
