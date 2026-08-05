// Background music: one looping track under the whole run, swapped for a
// second one the moment the story turns. The office theme plays until the
// escape route opens — that only happens once the killer has killed — and
// from then on it is the chase.
//
// Like sfx.ts and tts.ts, playback waits for the browser's first user
// gesture; before that, nothing is started and nothing errors.

import { getEscapeRoute } from "./escapeRoute";

type Track = "normal" | "runAway";

const SOURCES: Record<Track, string> = {
  normal: "/bgm/normal.mp3",
  runAway: "/bgm/run-away.mp3",
};

// Well under the dialogue: this sits beneath eight people talking over each
// other, and TTS lines have to stay intelligible through it. Both files are
// mastered far hotter than the speech and the stings, so the number that
// balances them by ear is much smaller than it looks — tuned live with
// bgm.volume() rather than guessed.
let VOLUME = 0.005;
// seconds to cross from one track to the other. Long enough to read as a
// change of mood rather than a cut, short enough that the chase music is
// already up while the body is still on screen.
const FADE_S = 2;

const players = new Map<Track, HTMLAudioElement>();

for (const [track, src] of Object.entries(SOURCES) as [Track, string][]) {
  const audio = new Audio(src);
  audio.preload = "auto";
  audio.loop = true;
  audio.volume = 0;
  players.set(track, audio);
}

let unlocked = false;
const unlock = () => {
  unlocked = true;
  window.removeEventListener("pointerdown", unlock);
  window.removeEventListener("keydown", unlock);
};
window.addEventListener("pointerdown", unlock);
window.addEventListener("keydown", unlock);

let playing: Track | null = null;

// Live handle on the mix, from the console: `bgm.state()` reports what is
// actually playing and at what level (which is also the quickest way to tell
// whether the page is running this build at all), and `bgm.volume(0.05)`
// re-levels it without a reload.
export function setBgmVolume(level: number) {
  VOLUME = Math.max(0, Math.min(1, level));
  const audio = playing && players.get(playing);
  if (audio) audio.volume = VOLUME;
  return VOLUME;
}

(window as any)["bgm"] = {
  volume: setBgmVolume,
  state: () => ({
    unlocked,
    playing,
    level: VOLUME,
    tracks: [...players].map(([track, audio]) => ({
      track,
      src: audio.getAttribute("src"),
      volume: audio.volume,
      muted: audio.muted,
      paused: audio.paused,
    })),
    // anything else on the page making noise — a stale element left by an
    // older build would show up here and nowhere else
    audioElements: document.querySelectorAll("audio").length,
  }),
};

// ticked from the main loop on wall time, so the fade runs at the same rate
// whether or not the sim is paused or a cutscene has the screen
export function updateBgm(dt: number) {
  if (!unlocked) return;
  // the escape route is opened by the first death and never closes, so this is
  // a one-way switch — no need to remember that the turn already happened
  const wanted: Track = getEscapeRoute() ? "runAway" : "normal";
  if (wanted !== playing) {
    playing = wanted;
    const audio = players.get(wanted)!;
    // the chase starts from its own first bar; the office theme, if it is
    // somehow being returned to, just picks back up
    if (wanted === "runAway") audio.currentTime = 0;
    audio.play().catch(() => {});
  }
  const step = (dt / FADE_S) * VOLUME;
  for (const [track, audio] of players) {
    const target = track === playing ? VOLUME : 0;
    if (audio.volume === target) {
      // a track faded all the way out stops, so it isn't decoding under the
      // one that replaced it
      if (target === 0 && !audio.paused) audio.pause();
      continue;
    }
    const delta = Math.min(step, Math.abs(target - audio.volume));
    audio.volume = Math.max(
      0,
      Math.min(1, audio.volume + (target > audio.volume ? delta : -delta)),
    );
  }
}
