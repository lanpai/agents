import { describe, expect, test } from "bun:test";
import { applyTtsPronunciationHints } from "./ttsPronunciation";

describe("TTS pronunciation hints", () => {
  test("pronounces Hirai as heRAI in English without changing larger words", () => {
    expect(applyTtsPronunciationHints("Hirai, ask HIRAI.", "en")).toBe(
      "heRAI, ask heRAI.",
    );
    expect(applyTtsPronunciationHints("Hiraishi", "en")).toBe("Hiraishi");
  });

  test("pronounces maimai as My-mai in English", () => {
    expect(applyTtsPronunciationHints("Let's play maimai.", "en")).toBe(
      "Let's play My-mai.",
    );
  });

  test("does not apply English hints to Japanese or Chinese speech", () => {
    expect(applyTtsPronunciationHints("Hirai", "ja")).toBe("Hirai");
    expect(applyTtsPronunciationHints("Hirai", "zh")).toBe("Hirai");
    expect(applyTtsPronunciationHints("maimai", "ja")).toBe("maimai");
  });
});
