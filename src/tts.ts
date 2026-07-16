const MAX_QUEUE = 8;
const UTTERANCE_FAILSAFE_MS = 15000;

let queued = 0;

// on init cancel all pending utterances
if ("speechSynthesis" in window) {
  speechSynthesis.cancel();
  speechSynthesis.resume();
}

// the sim pauses while this is true so actions never run ahead of the audio
export function isSpeaking(): boolean {
  return queued > 0;
}

export function pauseSpeech() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if ("speechSynthesis" in window) speechSynthesis.pause();
}

export function resumeSpeech() {
  if ("speechSynthesis" in window) speechSynthesis.resume();
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
  if (queued >= MAX_QUEUE) return false; // drop speech rather than building a backlog
  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) utterance.voice = voice;
  utterance.pitch = pitch;
  utterance.rate = 1.1;
  utterance.volume = volume;

  // a lost "end" event would otherwise pause the sim forever
  let settled = false;
  const done = () => {
    if (settled) return;
    settled = true;
    queued--;
    events?.onEnd?.();
  };
  utterance.addEventListener("start", () => events?.onStart?.());
  utterance.addEventListener("end", done);
  utterance.addEventListener("error", done);
  setTimeout(done, UTTERANCE_FAILSAFE_MS);

  queued++;
  speechSynthesis.speak(utterance);
  return true;
}
