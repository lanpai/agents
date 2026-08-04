import { Room } from "./types";

export const gamesTeamArea = new Room({
  name: "Games Team Area",
  promptName: "the games team work area (upstairs)",
  x: -600,
  y: -150,
  w: 200,
  h: 150,
  doors: ["Upstairs Work Area"],
  interactables: [],
});
