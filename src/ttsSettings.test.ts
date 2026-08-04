import { describe, expect, test } from "bun:test";
import {
  chooseAutomaticTtsServer,
  DEFAULT_TTS_SERVER_URL,
  LEGACY_TTS_SERVER_URL,
  TAILSCALE_TTS_SERVER_URL,
} from "./ttsSettings";

describe("automatic TTS server selection", () => {
  test("prefers localhost and stops after success", async () => {
    const probes: string[] = [];
    const selected = await chooseAutomaticTtsServer(async (url) => {
      probes.push(url);
      return true;
    });
    expect(selected).toEqual({ url: DEFAULT_TTS_SERVER_URL, source: "local" });
    expect(probes).toEqual([DEFAULT_TTS_SERVER_URL]);
  });

  test("uses Tailscale when localhost is unavailable", async () => {
    const selected = await chooseAutomaticTtsServer(
      async (url) => url === TAILSCALE_TTS_SERVER_URL,
    );
    expect(selected).toEqual({
      url: TAILSCALE_TTS_SERVER_URL,
      source: "tailscale",
    });
  });

  test("falls back to legacy TTS when routed endpoints are unavailable", async () => {
    const selected = await chooseAutomaticTtsServer(async () => false);
    expect(selected).toEqual({ url: LEGACY_TTS_SERVER_URL, source: "legacy" });
  });
});
