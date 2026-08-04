// one-shot sound effects. Speech goes through tts.ts's AudioContext and its
// one-at-a-time queue; these are stings that fire alongside whatever is
// playing, so they get their own plain <audio> elements and no queue.
//
// Browsers refuse playback until the page has seen a user gesture. Rather
// than error on every early sting, we hold a flag and simply drop anything
// requested before the first interaction — the same bargain tts.ts makes.

export type SoundEffect = "knife" | "stab" | "kill" | "win";

const SOURCES: Record<SoundEffect, string> = {
  knife: "/sfx/picked-up-knife.mp3",
  stab: "/sfx/kill.mp3",
  kill: "/sfx/dead-bodies.mp3",
  win: "/sfx/win.mp3",
};

// stings run loud next to speech; trim the long ones so a line under them
// stays intelligible
const VOLUME: Partial<Record<SoundEffect, number>> = {
  kill: 0.8,
  win: 0.8,
};

// one warm element per effect so the file is fetched and decoded before the
// moment it is needed — a stab sting that starts loading on the stab is late
const preloaded = new Map<SoundEffect, HTMLAudioElement>();

for (const [name, src] of Object.entries(SOURCES) as [SoundEffect, string][]) {
  const audio = new Audio(src);
  audio.preload = "auto";
  preloaded.set(name, audio);
}

let unlocked = false;
const unlock = () => {
  unlocked = true;
  window.removeEventListener("pointerdown", unlock);
  window.removeEventListener("keydown", unlock);
};
window.addEventListener("pointerdown", unlock);
window.addEventListener("keydown", unlock);

export function playSfx(name: SoundEffect) {
  if (!unlocked) return; // no gesture yet: the browser would reject it anyway
  const warm = preloaded.get(name);
  if (!warm) return;
  // clone so two of the same sting can overlap, and so replaying never has to
  // wait on a seek of the element still sounding
  const audio = warm.cloneNode() as HTMLAudioElement;
  audio.volume = VOLUME[name] ?? 1;
  // a blocked or missing file must never take the sim down with it
  audio.play().catch(() => {});
}
