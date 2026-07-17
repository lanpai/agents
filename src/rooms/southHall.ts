import { Room } from "./types";

export const southHall = new Room({
  name: "South Hall",
  promptName: "the south hall",
  x: -140,
  y: -120,
  w: 40,
  h: 320,
  doors: [
    "North Hall",
    "Evening Whiskey's Room",
    "Second Opinion's Room",
    "Lucky in Love and Old Fashioned's Room",
    "Texas Tea's Room",
    "Parting Shot's Room",
    "Bedroom 6",
    "Bedroom 7",
    "Bedroom 8",
  ],
});
