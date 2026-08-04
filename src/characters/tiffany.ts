import { addStatusToHumanoid } from "../statuses";
import { MaimaiPlayer } from "../statuses/maimaiPlayer";
import { sheet, type Character } from "./types";

export const tiffany: Character = {
  name: "Tiffany",
  sprite: {
    walk: sheet("/tiffany_walk.png", 250, 36),
    stab: sheet("/tiffany_stab.png", 250, 39.1),
    stabbed: sheet("/tiffany_stabbed.png", 250, 41.8),
  },
  description: "",
  voice: {
    routedVoice: "tiffany",
    baseF0: 130,
    rate: 75,
    scale: 1.0,
    effort: 0.35,
    aspiration: 0.2,
  },
  language: { native: "en", known: ["en", "ja", "zh"] },
  initialMemory: "",
  describeHumanoid: () => "",

  onInit: (humanoid) => {
    addStatusToHumanoid(humanoid, MaimaiPlayer);
  },
};
