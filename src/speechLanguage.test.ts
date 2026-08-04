import { describe, expect, test } from "bun:test";
import {
  crossLanguageEmotionFromStored,
  sharedConversationLanguages,
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

describe("shared conversation languages", () => {
  const eric = ["zh", "ja", "en"] as const;

  test("restricts Eric to English when Leland is listening", () => {
    expect(sharedConversationLanguages(eric, "zh", [["en"]])).toEqual(["en"]);
  });

  test("uses Japanese with Hirai and Chinese with Chinese speakers", () => {
    expect(sharedConversationLanguages(eric, "zh", [["ja"]])).toEqual(["ja"]);
    expect(
      sharedConversationLanguages(eric, "zh", [
        ["zh", "ja", "en"],
        ["en", "ja", "zh"],
      ]),
    ).toEqual(["zh", "ja", "en"]);
  });

  test("falls back to native when no shared language exists", () => {
    expect(sharedConversationLanguages(["ja"], "ja", [["en"]])).toEqual([
      "ja",
    ]);
  });
});
