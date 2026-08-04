import { Knife } from "../interactables/knife";
import { Room } from "./types";

export const kitchen = new Room({
  name: "Kitchen",
  promptName: "the kitchen (upstairs)",
  x: -200,
  y: -150,
  w: 200,
  h: 150,
  doors: ["Downstairs Work Area", "Upstairs Work Area", "Upstairs Office"],
  interactables: [new Knife(-180, -130)],
  floor: "tile",
});
