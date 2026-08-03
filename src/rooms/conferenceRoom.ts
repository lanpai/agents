import { Room } from "./types";

export const conferenceRoom = new Room({
  name: "Conference Room",
  promptName: "the conference room",
  x: 100,
  y: -75,
  w: 100,
  h: 75,
  doors: ["Arcade Room"],
  interactables: [],
  floor: "checker",
});
