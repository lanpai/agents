import { Room } from "./types";

export const foyer = new Room({
  name: "Foyer",
  promptName: "the foyer",
  x: -360,
  y: -160,
  w: 120,
  h: 200,
  doors: ["Porch", "North Hall", "Library"],
});
