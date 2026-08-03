import type { Character } from "./types";

export const yp: Character = {
  name: "YP",
  sprite: { src: "/yp_walk.png", cell: 96, frames: 4, frameMs: 260 },
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
