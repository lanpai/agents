const STORAGE_KEY = "sim:qwen-routed-tts-url";

export const DEFAULT_TTS_SERVER_URL = "http://127.0.0.1:8092";
export const TTS_SERVER_PRESETS = [
  DEFAULT_TTS_SERVER_URL,
  "http://127.0.0.1:9001",
  "http://127.0.0.1:8094",
] as const;

export function getTtsServerUrl(): string {
  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_TTS_SERVER_URL;
}

export function setTtsServerUrl(value: string): string {
  const url = normalizeTtsServerUrl(value);
  localStorage.setItem(STORAGE_KEY, url);
  return url;
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
