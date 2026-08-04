const STORAGE_KEY = "sim:qwen-routed-tts-url";

export const DEFAULT_TTS_SERVER_URL = "http://127.0.0.1:8092";
export const TAILSCALE_TTS_SERVER_URL =
  "http://tinybox.alpaca-elnath.ts.net:8092";
export const LEGACY_TTS_SERVER_URL = "http://127.0.0.1:9001";
export const TTS_SERVER_PRESETS = [
  DEFAULT_TTS_SERVER_URL,
  TAILSCALE_TTS_SERVER_URL,
  LEGACY_TTS_SERVER_URL,
  "http://127.0.0.1:8094",
] as const;

export type TtsServerSelection = {
  url: string;
  source: "local" | "tailscale" | "legacy" | "manual";
};

let activeUrl: string | null = null;
let manualRevision = 0;

export function getTtsServerUrl(): string {
  return (
    activeUrl ?? localStorage.getItem(STORAGE_KEY) ?? DEFAULT_TTS_SERVER_URL
  );
}

export function setTtsServerUrl(value: string): string {
  const url = normalizeTtsServerUrl(value);
  manualRevision++;
  activeUrl = url;
  localStorage.setItem(STORAGE_KEY, url);
  return url;
}

export async function chooseAutomaticTtsServer(
  probe: (url: string) => Promise<boolean>,
): Promise<TtsServerSelection> {
  if (await probe(DEFAULT_TTS_SERVER_URL)) {
    return { url: DEFAULT_TTS_SERVER_URL, source: "local" };
  }
  if (await probe(TAILSCALE_TTS_SERVER_URL)) {
    return { url: TAILSCALE_TTS_SERVER_URL, source: "tailscale" };
  }
  return { url: LEGACY_TTS_SERVER_URL, source: "legacy" };
}

export async function initializeTtsServerUrl(): Promise<TtsServerSelection> {
  const revision = manualRevision;
  const selection = await chooseAutomaticTtsServer(async (url) => {
    try {
      const response = await fetch(
        `/api/tts/check?serverUrl=${encodeURIComponent(url)}`,
        { signal: AbortSignal.timeout(4000) },
      );
      return response.ok;
    } catch {
      return false;
    }
  });
  // A person can edit the field while a slow probe is outstanding. Their
  // explicit choice wins rather than being overwritten when the probe lands.
  if (manualRevision !== revision) {
    return { url: getTtsServerUrl(), source: "manual" };
  }
  activeUrl = selection.url;
  localStorage.setItem(STORAGE_KEY, selection.url);
  return selection;
}

function normalizeTtsServerUrl(value: string): string {
  const withProtocol = /^https?:\/\//i.test(value.trim())
    ? value.trim()
    : `http://${value.trim()}`;
  const url = new URL(withProtocol);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("TTS URL must use http or https");
  }
  if (!url.port) throw new Error("TTS URL must include a port");
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
