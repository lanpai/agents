import { addStatusToHumanoid } from "../statuses";
import { MaimaiPlayer } from "../statuses/maimaiPlayer";
import type { Character } from "./types";

export const tiffany: Character = {
  name: "Tiffany",
  sprite: { src: "/tiffany_walk.png", cell: 96, frames: 4, frameMs: 250 },
  description: "",
  voice: {
    baseF0: 130,
    rate: 75,
    scale: 1.0,
    effort: 0.35,
    aspiration: 0.2,
  },
  initialMemory: "",
  describeHumanoid: () => "",

  onInit: (humanoid) => {
    addStatusToHumanoid(humanoid, MaimaiPlayer);
  },
};
