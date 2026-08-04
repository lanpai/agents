import { addStatusToHumanoid } from "../statuses";
import { DDRPlayer } from "../statuses/ddrPlayer";
import { sheet, type Character } from "./types";

export const tyler: Character = {
  name: "Tyler",
  sprite: {
    walk: sheet("/tyler_walk.png", 250, 36),
    stab: sheet("/tyler_stab.png", 250, 36.7),
    stabbed: sheet("/tyler_stabbed.png", 250, 36.6),
  },
  description: "",
  voice: {
    routedVoice: "tyler",
    baseF0: 130,
    rate: 75,
    scale: 1.0,
    effort: 0.35,
    aspiration: 0.2,
  },
  language: { native: "en", known: ["en"] },
  initialMemory: "",
  describeHumanoid: () => "",

  onInit: (humanoid) => {
    addStatusToHumanoid(humanoid, DDRPlayer);
  },
};
