import type { Humanoid } from "../humanoid";

// settings for the klattsch formant synthesizer; passed straight to
// compileString as the voice's initial state
export type Voice = {
  baseF0: number; // fundamental pitch in Hz (~80 deep male, ~210 high female)
  rate: number; // ms per phoneme; 110 is neutral, higher speaks slower (clamped to 50-200)
  scale: number; // formant scale: <1 bigger/deeper vocal tract, >1 smaller/brighter
  effort: number; // glottal pulse shape 0..1 (0 = lax and soft, 1 = tense and pressed)
  aspiration?: number; // 0..1 breath noise mixed into the voice
  tilt?: number; // -0.95..0.95 spectral tilt (negative = darker, positive = brighter)
  vibratoDepth?: number; // Hz of pitch wobble
  vibratoRate?: number; // wobbles per second
};

// a walk sheet built by scripts/make_sprite_sheet.py: four square cells per row,
// one row per facing in the order front, back, left, right
export type SpriteSheet = {
  src: string; // image path under public/
  cell: number; // pixel size of one square cell
  frames: number; // poses per row
  frameMs: number; // how long one pose is held
};

export type Character = {
  name: string;
  sprite: SpriteSheet; // drawn at SPRITE_SIZE world units square
  description: string;
  voice: Voice;
  initialMemory: string;
  describeHumanoid: (humanoid: Humanoid, viewer: Humanoid) => string;

  onInit?: (humanoid: Humanoid) => void;
};
