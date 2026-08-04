import { sheet, type CharacterSprites } from "./types";

// Whitecat has no place in the cast — it never walks the office or takes a
// turn. It exists only as the thing under everyone else's face: see
// src/humanoid.ts's reveal, which swaps these cells in over whoever is holding
// the knife. The sheets come from the same script as the cast's, so a cell
// lines up on the ground line with any character's and the swap doesn't shift.
export const whitecatSprites: CharacterSprites = {
  walk: sheet("/whitecat_walk.png", 250, 36),
  stab: sheet("/whitecat_stab.png", 250, 65.3),
  stabbed: sheet("/whitecat_stabbed.png", 250, 48.3),
};
