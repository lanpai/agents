import { Room } from "./types";

export const diningRoom = new Room({
  name: "Dining Room",
  promptName: "the dining room",
  x: -210,
  y: -310,
  w: 200,
  h: 150,
  doors: ["North Hall", "Kitchen"],
});
