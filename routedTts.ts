import { Buffer } from "node:buffer";
import { basename, resolve } from "node:path";
import type { RoutedVoice } from "./src/characters/types";
import type { SpeechEmotion } from "./src/speechEmotion";

type Clip = {
  file: string;
  text: string;
  emotion: string;
  speaker_embedding_file: string;
};

type Manifest = {
  language: "en" | "zh" | "ja";
  speaker_embedding_mean_file: string;
  clips: Clip[];
};

export type RoutedIclFields = {
  language: "English" | "Chinese" | "Japanese";
  speaker_embedding: number[];
  x_vector_only_mode: boolean;
  ref_audio?: string;
  ref_text?: string;
  route: string;
};

const ASSET_ROOT = resolve(import.meta.dir, "assets", "routed-icl");
const ROUTED_VOICES = new Set<RoutedVoice>([
  "cory",
  "eric",
  "hirai",
  "leland",
  "tiffany",
  "tyler",
  "yanghua",
  "yp",
]);
const LANGUAGE_NAMES = {
  en: "English",
  zh: "Chinese",
  ja: "Japanese",
} as const;

const manifestCache = new Map<RoutedVoice, Promise<Manifest>>();
const embeddingCache = new Map<string, Promise<number[]>>();
const audioCache = new Map<string, Promise<string>>();

export function isRoutedVoice(value: unknown): value is RoutedVoice {
  return typeof value === "string" && ROUTED_VOICES.has(value as RoutedVoice);
}

export async function buildRoutedIclFields(
  voice: RoutedVoice,
  emotion: SpeechEmotion,
): Promise<RoutedIclFields> {
  const manifest = await loadManifest(voice);
  const language = LANGUAGE_NAMES[manifest.language];
  const clip = manifest.clips.find((candidate) => candidate.emotion === emotion);

  if (emotion === "neutral" || !clip) {
    return {
      language,
      speaker_embedding: await loadEmbedding(
        assetPath(voice, manifest.speaker_embedding_mean_file),
      ),
      x_vector_only_mode: true,
      route: "neutral",
    };
  }

  return {
    language,
    ref_audio: await loadAudio(assetPath(voice, clip.file)),
    ref_text: clip.text,
    speaker_embedding: await loadEmbedding(
      assetPath(voice, clip.speaker_embedding_file),
    ),
    x_vector_only_mode: false,
    route: clip.emotion,
  };
}

function loadManifest(voice: RoutedVoice): Promise<Manifest> {
  let promise = manifestCache.get(voice);
  if (!promise) {
    promise = Bun.file(assetPath(voice, "manifest.json")).json() as Promise<Manifest>;
    manifestCache.set(voice, promise);
  }
  return promise;
}

function loadEmbedding(path: string): Promise<number[]> {
  let promise = embeddingCache.get(path);
  if (!promise) {
    promise = Bun.file(path).json().then((value) => {
      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        !value.every(
          (item) => typeof item === "number" && Number.isFinite(item),
        )
      ) {
        throw new Error(`Invalid routed TTS embedding: ${path}`);
      }
      return value as number[];
    });
    embeddingCache.set(path, promise);
  }
  return promise;
}

function loadAudio(path: string): Promise<string> {
  let promise = audioCache.get(path);
  if (!promise) {
    promise = Bun.file(path)
      .arrayBuffer()
      .then(
        (bytes) =>
          `data:audio/wav;base64,${Buffer.from(bytes).toString("base64")}`,
      );
    audioCache.set(path, promise);
  }
  return promise;
}

function assetPath(voice: RoutedVoice, file: string): string {
  if (file !== basename(file)) throw new Error(`Invalid routed asset: ${file}`);
  return resolve(ASSET_ROOT, voice, file);
}
