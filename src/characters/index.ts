import { cory } from "./cory";
import { eric } from "./eric";
import { hirai } from "./hirai";
import { leland } from "./leland";
import { tiffany } from "./tiffany";
import { tyler } from "./tyler";
import { yanghua } from "./yanghua";
import { yp } from "./yp";
import type { Character } from "./types";

export const CHARACTERS: Character[] = [
  cory,
  leland,
  eric,
  hirai,
  yp,
  tiffany,
  tyler,
  yanghua,
];

// characters carry functions, so saves store only the name and re-resolve here
export function characterByName(name: string): Character | undefined {
  return CHARACTERS.find((character) => character.name === name);
}
