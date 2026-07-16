import type Anthropic from "@anthropic-ai/sdk";
import type { Humanoid } from "../humanoid";

export type SimTool = {
  name: string;
  // the definition sent to the API — a plain object, or a builder for tools
  // whose schema depends on the humanoid's situation (e.g. which doors and
  // roommates are currently available)
  definition:
    | Anthropic.Tool
    | ((humanoid: Humanoid, world: Humanoid[]) => Anthropic.Tool);
  // when present and false, the humanoid neither sees the tool nor can call it
  condition?: (humanoid: Humanoid, world: Humanoid[]) => boolean;
  execute: (
    humanoid: Humanoid,
    world: Humanoid[],
    input: Record<string, unknown>,
  ) => void;
};
