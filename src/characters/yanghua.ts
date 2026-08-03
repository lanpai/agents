import { sheet, type Character } from "./types";

export const yanghua: Character = {
  name: "Yanghua",
  sprite: {
    walk: sheet("/yanghua_walk.png", 250, 36),
    stab: sheet("/yanghua_stab.png", 250, 39),
    stabbed: sheet("/yanghua_stabbed.png", 250, 35.9),
  },
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
};
