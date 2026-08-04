// Speech streams as raw 24 kHz PCM from the backend's Qwen3-TTS proxy. If the
// Qwen server is unavailable, klattsch remains as a browser-only fallback.
// Lines play one at a time, in the order they were queued.

import { compileString, PHONEME_KEYS } from "klattsch";
import workletUrl from "klattsch/formant-worklet.js?url";
import { recordAgentCall } from "./calls";
import type { Voice } from "./characters/types";
import { getTtsEnabled, getTtsServerUrl } from "./ttsSettings";
import type { SpeechEmotion } from "./speechEmotion";
import { getCrossLanguageEmotion, type SpeechLanguage } from "./speechLanguage";
import { applyTtsPronunciationHints } from "./ttsPronunciation";

const MAX_QUEUE = 8;
const PHONEME_TIMEOUT_MS = 15000;
const LINE_GAP_MS = 250; // breath between consecutive lines
const QWEN_SAMPLE_RATE = 24000;
const QWEN_START_LEAD_SECONDS = 0.12;

type Line = {
  text: string;
  speaker: string; // character name, for the debug call log
  voice: Voice;
  delivery?: string; // stage direction ("flat and cold", "almost a whisper")
  emotion: SpeechEmotion;
  language: SpeechLanguage;
  volume: number;
  onStart?: () => void;
  onEnd?: () => void;
};

// a silent beat: an *action* bubble holding the screen like a spoken line
type Beat = {
  silentMs: number;
  onStart?: () => void;
  onEnd?: () => void;
};

const queue: (Line | Beat)[] = [];
let queued = 0; // lines waiting or playing
let playing = false;

// the sim freezes a talker's room while a line of theirs is queued or playing
export function isSpeaking(): boolean {
  return queued > 0;
}

// browsers keep AudioContexts suspended until the page gets a user gesture;
// hold all speech until the first interaction (callers fall back to timed
// bubbles) and build the context inside the gesture handler so resume() works
let unlocked = false;
type AudioOutput = {
  context: AudioContext;
  formantNode: AudioWorkletNode | null;
  gain: GainNode;
};

let audioReady: Promise<AudioOutput> | null = null;

async function initAudio() {
  const ctx = new AudioContext();
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  let formantNode: AudioWorkletNode | null = null;
  try {
    await ctx.audioWorklet.addModule(workletUrl);
    formantNode = new AudioWorkletNode(ctx, "formant-processor");
    formantNode.connect(gain);
  } catch {
    // Qwen PCM playback only needs the AudioContext and remains available.
  }
  await ctx.resume();
  return { context: ctx, formantNode, gain };
}

const unlock = () => {
  unlocked = true;
  audioReady = initAudio();
  audioReady.catch(() => {}); // a failed init surfaces per-line in pump()
  window.removeEventListener("pointerdown", unlock);
  window.removeEventListener("keydown", unlock);
};
window.addEventListener("pointerdown", unlock);
window.addEventListener("keydown", unlock);

// returns false when the line won't be voiced (no user gesture yet or the
// queue is full), so the caller can fall back to a timed speech bubble
export function speak(
  text: string,
  line: {
    speaker: string;
    voice: Voice;
    delivery?: string;
    emotion?: SpeechEmotion;
    language: SpeechLanguage;
    volume?: number;
    onStart?: () => void;
    onEnd?: () => void;
  },
): boolean {
  // Dev mode can bypass generation and the serialized audio queue entirely.
  // The caller still shows a timed bubble, but its room is not held frozen.
  if (!getTtsEnabled()) return false;
  if (!unlocked || text.length === 0) return false;
  if (queued >= MAX_QUEUE) return false; // drop speech rather than building a backlog
  queued++;
  queue.push({
    text: applyTtsPronunciationHints(text, line.language),
    volume: 0.8,
    emotion: "neutral",
    ...line,
  });
  void pump();
  return true;
}

// queue a silent beat: it takes the same one-at-a-time slot as a spoken line
// (so actions and dialogue never share the screen) but plays no audio.
// Returns false when the queue is full, so the caller can fall back to an
// instant bubble.
export function queueBeat(
  silentMs: number,
  callbacks: { onStart?: () => void; onEnd?: () => void },
): boolean {
  if (queued >= MAX_QUEUE) return false;
  queued++;
  queue.push({ silentMs, ...callbacks });
  void pump();
  return true;
}

// Spoken lines prefer Qwen and fall back to the formant synthesizer. Both
// paths hold the same queue used by silent beats, so dialogue and actions
// never share the screen.
async function pump() {
  if (playing) return;
  const item = queue.shift();
  if (!item) return;
  playing = true;

  if ("silentMs" in item) {
    item.onStart?.();
    await delay(item.silentMs);
    item.onEnd?.();
  } else {
    let started = false;
    const startLine = () => {
      if (started) return;
      started = true;
      item.onStart?.();
    };
    try {
      if (!audioReady) throw new Error("audio not unlocked");
      const audio = await audioReady;
      try {
        await playQwen(item, audio, startLine);
      } catch {
        await playFormant(item, audio, startLine);
      }
    } catch {
      startLine();
      await delay(2000 + item.text.length * 60);
    }
    item.onEnd?.();
  }
  await delay(LINE_GAP_MS);
  queued--;
  playing = false;
  void pump();
}

async function playQwen(
  line: Line,
  audio: AudioOutput,
  onStart: () => void,
) {
  const record = recordAgentCall({
    humanoid: line.speaker,
    kind: "tts",
    messages: line.text,
    tools: [],
  });
  let nextStartAt: number | null = null;
  let receivedBytes = 0;
  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(120000),
      body: JSON.stringify({
        text: line.text,
        speakerEmbedding: line.voice.speakerEmbedding,
        voice: line.voice.ttsVoice,
        routedVoice: line.voice.routedVoice,
        emotion: line.emotion,
        language: line.language,
        crossLanguageEmotion: getCrossLanguageEmotion(),
        serverUrl: getTtsServerUrl(),
      }),
    });
    if (!response.ok || !response.body) {
      throw new Error(`TTS API ${response.status}`);
    }
    const route = response.headers.get("x-tts-route");
    const referenceLanguage = response.headers.get(
      "x-tts-reference-language",
    );

    audio.gain.gain.value = line.volume;
    const reader = response.body.getReader();
    let pendingByte: number | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;
      receivedBytes += value.length;

      let bytes = value;
      if (pendingByte !== null) {
        const joined = new Uint8Array(value.length + 1);
        joined[0] = pendingByte;
        joined.set(value, 1);
        bytes = joined;
        pendingByte = null;
      }
      if (bytes.length % 2 !== 0) {
        pendingByte = bytes[bytes.length - 1]!;
        bytes = bytes.subarray(0, bytes.length - 1);
      }
      if (bytes.length === 0) continue;

      const samples = new Float32Array(bytes.length / 2);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let index = 0; index < samples.length; index++) {
        samples[index] = view.getInt16(index * 2, true) / 32768;
      }

      const buffer = audio.context.createBuffer(
        1,
        samples.length,
        QWEN_SAMPLE_RATE,
      );
      buffer.copyToChannel(samples, 0);
      const source = audio.context.createBufferSource();
      source.buffer = buffer;
      source.connect(audio.gain);

      if (nextStartAt === null) {
        nextStartAt = audio.context.currentTime + QWEN_START_LEAD_SECONDS;
        const waitMs = Math.max(
          0,
          (nextStartAt - audio.context.currentTime) * 1000,
        );
        setTimeout(onStart, waitMs);
      } else {
        nextStartAt = Math.max(nextStartAt, audio.context.currentTime + 0.01);
      }
      source.start(nextStartAt);
      nextStartAt += buffer.duration;
    }

    if (nextStartAt === null) throw new Error("TTS API returned no PCM audio");
    record.status = "ok";
    record.result = [
      `${line.voice.routedVoice ?? "default"}/${route ?? line.emotion} in ${line.language}${referenceLanguage ? ` using ${referenceLanguage} reference` : ""}: ${receivedBytes} PCM bytes`,
    ];
    await delay(
      Math.max(0, (nextStartAt - audio.context.currentTime) * 1000) + 20,
    );
  } catch (error) {
    record.status = "error";
    record.result = [String(error)];
    // If a stream fails after playback began, let the received prefix finish
    // instead of starting the fallback voice over the top of it.
    if (nextStartAt !== null) {
      await delay(
        Math.max(0, (nextStartAt - audio.context.currentTime) * 1000) + 20,
      );
      return;
    }
    throw error;
  }
}

async function playFormant(
  line: Line,
  audio: AudioOutput,
  onStart: () => void,
) {
  if (line.language !== "en")
    throw new Error("formant fallback only supports English");
  if (!audio.formantNode) throw new Error("formant worklet unavailable");
  const phonemes = await phonemize(line);
  const { schedule, totalMs } = compileString(phonemes, {
    ...line.voice,
    rate: clampRate(line.voice.rate),
  });
  audio.gain.gain.value = line.volume;
  audio.formantNode.port.postMessage({ type: "schedule", schedule });
  onStart();
  await delay(totalMs);
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const VALID_PHONEMES = new Set(PHONEME_KEYS);
const PAUSE_MS: Record<string, number> = { ",": 100, ";": 200, ".": 300 };

const PHONEME_SYSTEM_PROMPT = `You transcribe spoken English lines into ARPABET phonemes for a primitive formant speech synthesizer.

Rules:
- Use only these phonemes: ${PHONEME_KEYS.join(" ")}
- Every phoneme is its own space-separated token. No stress digits (write AH, never AH0).
- Append ' to the stressed vowel of emphasized words (e.g. N OW').
- Words in the same clause run together with nothing between them — inserting breaks between ordinary words sounds broken and robotic.
- Only where the written punctuation marks a real break, insert , ; or . as its own token (short, medium, long pause). Most lines need one or two at most, often none.
- Transcribe how the line is naturally spoken aloud: expand numbers and abbreviations into words.

A delivery direction may accompany the line. Shape it with these directives, each as its own token:
- b+20 / b-15 bends the pitch up/down (Hz) from that point on; a bare b returns to the speaker's normal pitch.
- r-20 speaks faster from that point on, r+25 slower (ms per phoneme); a bare r returns to normal speed.
- g0.9 makes the voice tense and forceful — the closest thing to loud; g0.25 lax and quiet; a bare g returns to normal.
- h0.5 adds breath for whispers and sighs; a bare h removes it.
- AA+15 glides the pitch up through that phoneme and stays there (a rising contour); AA(+40) is a momentary ornament on just that phoneme.
Bend only the parts the direction calls out and return to normal (bare b r g h) right after. A plain line needs no directives at all.`;

const PHONEME_TOOL = {
  name: "transcribe",
  description: "Submit the ARPABET transcription of the line.",
  input_schema: {
    type: "object",
    properties: {
      phonemes: {
        type: "string",
        description:
          "Space-separated ARPABET phonemes, with , ; . tokens for pauses",
      },
    },
    required: ["phonemes"],
  },
};

// expressiveness clamps: a line may bend the character's voice, not replace it
const MAX_PITCH_BEND = 80; // Hz, for b± directives and per-phoneme deltas
// the speaking rate always stays within speech: faster than 50 ms per phoneme
// melts into gibberish, slower than 200 falls apart into disconnected sounds
const MIN_RATE_MS = 50;
const MAX_RATE_MS = 200;
export const clampRate = (rate: number) =>
  Math.min(MAX_RATE_MS, Math.max(MIN_RATE_MS, rate));

// one token of model output -> one validated token, or null to drop it.
// Accepted: pause tokens; expressive directives (relative b± pitch bends,
// absolute 0..1 g/h, and bare-letter resets back to the character voice);
// known phonemes with optional stress ' and a clamped pitch delta. CMU-style
// stress digits are stripped; everything else is garbage the compiler never
// sees. Rate directives are handled separately in sanitizePhonemes, which
// tracks the running rate
function sanitizeToken(token: string): string | null {
  if (token in PAUSE_MS) return token;

  const directive = token.match(/^([bgh])(?:([+-])?(\d+(?:\.\d+)?))?$/);
  if (directive) {
    const [, letter, sign, digits] = directive;
    if (digits === undefined) return letter!; // bare reset
    const value = Number(digits);
    if (letter === "b") return sign && value <= MAX_PITCH_BEND ? token : null;
    return !sign && value <= 1 ? token : null; // g/h: absolute 0..1 only
  }

  const phoneme = token
    .toUpperCase()
    .match(/^([A-Z]+)[0-9]?(')?([+-]\d+(?:\.\d+)?|\([+-]\d+(?:\.\d+)?\))?$/);
  if (!phoneme || !VALID_PHONEMES.has(phoneme[1]!)) return null;
  const base = phoneme[1]! + (phoneme[2] ?? "");
  const delta = phoneme[3];
  if (!delta || Math.abs(Number(delta.replace(/[()]/g, ""))) > MAX_PITCH_BEND)
    return base;
  return base + delta;
}

// models also love sprinkling pauses between words, which sounds broken — so
// pauses before any speech are dropped and runs of pauses collapse to the
// single longest one
function sanitizePhonemes(raw: string, baseRate: number): string {
  const base = clampRate(baseRate);
  let rate = base;
  const tokens: string[] = [];
  for (const part of raw.split(/\s+/)) {
    // r± bends are relative and would stack, so they run through a tracked
    // running rate that clamps absolutely — emitted as the clamped absolute
    // value (bare r returns to the character's own rate)
    const bend = part.match(/^r([+-]\d+(?:\.\d+)?)?$/);
    if (bend) {
      const next =
        bend[1] === undefined ? base : clampRate(rate + Number(bend[1]));
      if (next !== rate) {
        rate = next;
        tokens.push(`r${next}`);
      }
      continue;
    }
    const token = sanitizeToken(part);
    if (token !== null) tokens.push(token);
  }

  const collapsed: string[] = [];
  for (const token of tokens) {
    if (token in PAUSE_MS) {
      if (collapsed.length === 0) continue; // no silence before the line starts
      const prev = collapsed[collapsed.length - 1]!;
      if (prev in PAUSE_MS) {
        if (PAUSE_MS[token]! > PAUSE_MS[prev]!)
          collapsed[collapsed.length - 1] = token;
        continue;
      }
    }
    collapsed.push(token);
  }
  return collapsed.join(" ");
}

// the second agent call: English text in, ARPABET phoneme string out
async function phonemize(line: Line): Promise<string> {
  const record = recordAgentCall({
    humanoid: line.speaker,
    kind: "phonemes",
    messages: line.text,
    tools: [PHONEME_TOOL.name],
  });
  try {
    const response = await fetch("/api/flash", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(PHONEME_TIMEOUT_MS),
      body: JSON.stringify({
        system: PHONEME_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content:
              `Transcribe: "${line.text}"` +
              (line.delivery ? `\nDelivery direction: ${line.delivery}` : ""),
          },
        ],
        tools: [PHONEME_TOOL],
        tool_choice: { type: "tool", name: PHONEME_TOOL.name },
        max_tokens: 700,
      }),
    });
    if (!response.ok) throw new Error(`agent API ${response.status}`);
    const message = (await response.json()) as {
      content: { type: string; name?: string; input?: unknown }[];
    };
    for (const block of message.content) {
      if (block.type === "tool_use" && block.name === PHONEME_TOOL.name) {
        const raw = (block.input as Record<string, unknown>).phonemes;
        if (typeof raw === "string") {
          const phonemes = sanitizePhonemes(raw, line.voice.rate);
          if (phonemes.length > 0) {
            record.result = [phonemes];
            record.status = "ok";
            return phonemes;
          }
        }
      }
    }
    throw new Error("no usable transcription returned");
  } catch (error) {
    record.result = [String(error)];
    record.status = "error";
    throw error;
  }
}
