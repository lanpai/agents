import type { Character } from "./types";

export const CHARACTERS: Character[] = [];

// characters carry functions, so saves store only the name and re-resolve here
export function characterByName(name: string): Character | undefined {
  return CHARACTERS.find((character) => character.name === name);
}
