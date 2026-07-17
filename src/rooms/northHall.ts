import { Room } from "./types";

export const northHall = new Room({
  name: "North Hall",
  promptName: "the north hall",
  x: -240,
  y: -160,
  w: 480,
  h: 40,
  doors: ["Foyer", "Dining Room", "South Hall", "Utility Room", "Parlor"],
});
