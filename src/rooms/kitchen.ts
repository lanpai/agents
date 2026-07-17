import { Knife } from "../interactables/knife";
import { Room } from "./types";

export const kitchen = new Room({
  name: "Kitchen",
  promptName: "the kitchen",
  x: -10,
  y: -310,
  w: 100,
  h: 150,
  doors: ["Dining Room", "Refrigerator Room"],
  interactables: [new Knife(70, -300)],
});
