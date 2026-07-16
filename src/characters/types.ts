import type { Humanoid } from "../humanoid";

export type Character = {
  name: string;
  description: string;
  voicePitch: number;
  initialMemory: string;
  describeHumanoid: (humanoid: Humanoid, viewer: Humanoid) => string;
};
