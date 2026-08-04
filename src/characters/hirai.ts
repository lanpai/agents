import { sheet, type Character } from "./types";

export const hirai: Character = {
  name: "Hirai",
  sprite: {
    walk: sheet("/hirai_walk.png", 229, 36),
    stab: sheet("/hirai_stab.png", 250, 50.7),
    stabbed: sheet("/hirai_stabbed.png", 250, 35.5),
  },
  description: "",
  voice: {
    routedVoice: "hirai",
    baseF0: 130,
    rate: 75,
    scale: 1.0,
    effort: 0.35,
    aspiration: 0.2,
  },
  language: { native: "ja", known: ["ja"] },
  initialMemory: "",
  describeHumanoid: () => "",
};
