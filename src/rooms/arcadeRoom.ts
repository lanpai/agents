import { DDR } from "../interactables/ddr";
import { Maimai } from "../interactables/maimai";
import { SDVX } from "../interactables/sdvx";
import { Room } from "./types";

export const arcadeRoom = new Room({
  name: "Arcade Room",
  promptName: "the arcade room (downstairs)",
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  doors: ["Game Room", "Conference Room", "Downstairs Work Area"],
  interactables: [new Maimai(180, 100), new DDR(20, 168), new SDVX(20, 104)],
  floor: "carpet",
});
