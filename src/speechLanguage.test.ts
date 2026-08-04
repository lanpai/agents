import { describe, expect, test } from "bun:test";
import {
  crossLanguageEmotionFromStored,
  mutuallyUnderstoodLanguages,
  speechModeFromStored,
} from "./speechLanguage";

describe("speech setting defaults", () => {
  test("fresh browsers use character languages and experimental emotion", () => {
    expect(speechModeFromStored(null)).toBe("character");
    expect(crossLanguageEmotionFromStored(null)).toBe(true);
  });

  test("preserves explicit presentation and neutral-only choices", () => {
    expect(speechModeFromStored("presentation")).toBe("presentation");
    expect(crossLanguageEmotionFromStored("false")).toBe(false);
  });
});

describe("mutual spoken languages", () => {
  const eric = ["zh", "ja", "en"] as const;

  test("restricts Eric to English when Leland is listening", () => {
    expect(mutuallyUnderstoodLanguages(eric, "zh", [["en"]])).toEqual(["en"]);
  });

  test("uses Japanese with Hirai and Chinese with Chinese speakers", () => {
    expect(mutuallyUnderstoodLanguages(eric, "zh", [["ja"]])).toEqual(["ja"]);
    expect(
      mutuallyUnderstoodLanguages(eric, "zh", [
        ["zh", "ja", "en"],
        ["en", "ja", "zh"],
      ]),
    ).toEqual(["zh", "ja", "en"]);
  });

  test("falls back to native when no shared language exists", () => {
    expect(mutuallyUnderstoodLanguages(["ja"], "ja", [["en"]])).toEqual([
      "ja",
    ]);
  });
});
