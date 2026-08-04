import { describe, expect, test } from "bun:test";
import { buildRoutedIclFields } from "./routedTts";
import type { RoutedVoice } from "./src/characters/types";
import { speechEmotionsForVoice } from "./src/speechEmotion";

const VOICES: RoutedVoice[] = [
  "cory",
  "eric",
  "hirai",
  "leland",
  "tiffany",
  "tyler",
  "yanghua",
  "yp",
];

describe("routed ICL assets", () => {
  for (const voice of VOICES) {
    test(`${voice} has a neutral mean and every declared emotional route`, async () => {
      const neutral = await buildRoutedIclFields(voice, "neutral");
      expect(neutral.route).toBe("neutral");
      expect(neutral.x_vector_only_mode).toBe(true);
      expect(neutral.speaker_embedding).toHaveLength(2048);
      expect(neutral.ref_audio).toBeUndefined();
      expect(neutral.ref_text).toBeUndefined();

      for (const emotion of speechEmotionsForVoice(voice)) {
        if (emotion === "neutral") continue;
        const emotional = await buildRoutedIclFields(voice, emotion);
        expect(emotional.route).toBe(emotion);
        expect(emotional.x_vector_only_mode).toBe(false);
        expect(emotional.speaker_embedding).toHaveLength(2048);
        expect(emotional.ref_audio).toStartWith("data:audio/wav;base64,");
        expect(emotional.ref_text?.length).toBeGreaterThan(0);
      }
    });
  }

  test("cross-language emotion is neutral by default and optional", async () => {
    const safe = await buildRoutedIclFields("eric", "terror", "ja", false);
    expect(safe.language).toBe("Japanese");
    expect(safe.route).toBe("neutral");
    expect(safe.x_vector_only_mode).toBe(true);
    expect(safe.crossLanguageReference).toBe(false);
    expect(safe.ref_audio).toBeUndefined();

    const experimental = await buildRoutedIclFields(
      "eric",
      "terror",
      "ja",
      true,
    );
    expect(experimental.language).toBe("Japanese");
    expect(experimental.referenceLanguage).toBe("Chinese");
    expect(experimental.route).toBe("terror");
    expect(experimental.x_vector_only_mode).toBe(false);
    expect(experimental.crossLanguageReference).toBe(true);
    expect(experimental.ref_audio).toStartWith("data:audio/wav;base64,");
  });
});
