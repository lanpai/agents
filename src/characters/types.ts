import type { Humanoid } from "../humanoid";

// Qwen uses speakerEmbedding/ttsVoice when available. The formant settings
// remain as a browser-only fallback when the Qwen server is unavailable.
export type Voice = {
  // Qwen3-TTS Base embeddings are 1024-dim (0.6B) or 2048-dim (1.7B).
  // Keep this optional while a character is waiting for its final embedding.
  speakerEmbedding?: readonly number[];
  // A registered server-side voice profile. Defaults to web_nori_v0.
  ttsVoice?: string;
  baseF0: number; // fundamental pitch in Hz (~80 deep male, ~210 high female)
  rate: number; // ms per phoneme; 110 is neutral, higher speaks slower (clamped to 50-200)
  scale: number; // formant scale: <1 bigger/deeper vocal tract, >1 smaller/brighter
  effort: number; // glottal pulse shape 0..1 (0 = lax and soft, 1 = tense and pressed)
  aspiration?: number; // 0..1 breath noise mixed into the voice
  tilt?: number; // -0.95..0.95 spectral tilt (negative = darker, positive = brighter)
  vibratoDepth?: number; // Hz of pitch wobble
  vibratoRate?: number; // wobbles per second
};

// a sheet built by scripts/make_sprite_sheet.py: four square cells per row, one
// row per facing in the order front, back, left, right
export type SpriteSheet = {
  src: string; // image path under public/
  cell: number; // pixel size of one square cell
  frames: number; // poses per row
  frameMs: number; // how long one pose is held
  // world units the cell is drawn at. A body on the floor needs a wider crop
  // than a standing one, so its cell covers more ground — drawing it larger by
  // the same ratio is what keeps the character one size across animations.
  size: number;
};

// every sheet the script emits is four poses across, four facings down, in
// 96px cells — only the tempo and the world size differ
export const sheet = (
  src: string,
  frameMs: number,
  size: number,
): SpriteSheet => ({ src, cell: 96, frames: 4, frameMs, size });

// walk loops forever; the other two play once and hand back to walk. Nothing
// but a knife (or a fist) triggers them, so they stay optional-free: every
// character ships all three.
export type CharacterSprites = {
  walk: SpriteSheet;
  stab: SpriteSheet;
  stabbed: SpriteSheet;
};

export type Character = {
  name: string;
  sprite: CharacterSprites;
  description: string;
  voice: Voice;
  initialMemory: string;
  describeHumanoid: (humanoid: Humanoid, viewer: Humanoid) => string;

  onInit?: (humanoid: Humanoid) => void;
};
