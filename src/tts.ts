const MAX_QUEUE = 8;
const UTTERANCE_FAILSAFE_MS = 15000;

let queued = 0;

// browsers block speech synthesis until the page gets a user gesture after
// load; speaking before that either silently drops the line or wedges the
// shared engine so nothing ever plays. Hold TTS until the first interaction
// (callers fall back to timed bubbles), and clear stale engine state then —
// the load-time cancel above doesn't always take effect without activation.
let unlocked = false;
if ("speechSynthesis" in window) {
  const unlock = () => {
    unlocked = true;
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

// the sim pauses while this is true so actions never run ahead of the audio
export function isSpeaking(): boolean {
  return queued > 0;
}

// prefer a deliberately robotic voice when the OS has one (e.g. macOS "Zarvox"/"Trinoids");
// otherwise the default voice with extreme per-humanoid pitch still reads as robotic
let voice: SpeechSynthesisVoice | null = null;
function pickVoice() {
  voice =
    speechSynthesis
      .getVoices()
      .find((v) => /zarvox|trinoids|robot/i.test(v.name)) ?? null;
}
if ("speechSynthesis" in window) {
  pickVoice();
  speechSynthesis.addEventListener("voiceschanged", pickVoice);
}

// returns false when the line won't be voiced (unsupported or queue full),
// so the caller can fall back to a timed speech bubble
export function speak(
  text: string,
  volume = 0.8,
  pitch: number,
  events?: { onStart?: () => void; onEnd?: () => void },
): boolean {
  if (!("speechSynthesis" in window) || text.length === 0) return false;
  if (!unlocked) return false; // no user gesture yet — speech would be blocked
  if (queued >= MAX_QUEUE) return false; // drop speech rather than building a backlog
  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) utterance.voice = voice;
  utterance.pitch = pitch;
  utterance.rate = 1.1;
  utterance.volume = volume;

  // a lost "end" event would otherwise pause the sim forever
  let settled = false;
  let started = false;
  const done = () => {
    if (settled) return;
    settled = true;
    queued--;
    events?.onEnd?.();
  };
  utterance.addEventListener("start", () => {
    started = true;
    events?.onStart?.();
  });
  utterance.addEventListener("end", done);
  utterance.addEventListener("error", done);
  setTimeout(() => {
    // never started after 15s: the engine is wedged — clear it so the lines
    // that come after this one can play
    if (!settled && !started) speechSynthesis.cancel();
    done();
  }, UTTERANCE_FAILSAFE_MS);

  queued++;
  speechSynthesis.speak(utterance);
  return true;
}
