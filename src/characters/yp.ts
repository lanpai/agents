import { sheet, type Character } from "./types";

export const yp: Character = {
  name: "YP",
  sprite: {
    walk: sheet("/yp_walk.png", 260, 36),
    stab: sheet("/yp_stab.png", 250, 39.7),
    stabbed: sheet("/yp_stabbed.png", 250, 37.4),
  },
  description: "",
  voice: {
    routedVoice: "yp",
    baseF0: 130,
    rate: 75,
    scale: 1.0,
    effort: 0.35,
    aspiration: 0.2,
  },
  language: { native: "en", known: ["en"] },
  initialMemory: "",
  describeHumanoid: () => "",
};
