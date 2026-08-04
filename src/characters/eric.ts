import { sheet, type Character } from "./types";

export const eric: Character = {
  name: "Eric",
  sprite: {
    walk: sheet("/eric_walk.png", 250, 36),
    stab: sheet("/eric_stab.png", 250, 53.9),
    stabbed: sheet("/eric_stabbed.png", 250, 36.6),
  },
  description: "",
  voice: {
    routedVoice: "eric",
    baseF0: 130,
    rate: 75,
    scale: 1.0,
    effort: 0.35,
    aspiration: 0.2,
  },
  initialMemory: "",
  describeHumanoid: () => "",
};
