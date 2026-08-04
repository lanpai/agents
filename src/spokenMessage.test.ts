import { describe, expect, test } from "bun:test";
import { spokenMessageFromWritten } from "./spokenMessage";

describe("spoken message construction", () => {
  test("rewrites only declared ambiguous tokens", () => {
    expect(
      spokenMessageFromWritten("SS+ at 5.0 uses API v2.", [
        { written: "SS+", spoken: "S S plus" },
        { written: "5.0", spoken: "five point zero" },
        { written: "API", spoken: "A P I" },
        { written: "v2", spoken: "version two" },
      ]),
    ).toBe("S S plus at five point zero uses A P I version two.");
  });

  test("rejects phrase rewrites, missing tokens, and malformed entries", () => {
    expect(
      spokenMessageFromWritten("Keep the whole sentence. SS+ wins.", [
        { written: "the whole sentence", spoken: "something else" },
        { written: "missing", spoken: "added words" },
        { written: "SS+", spoken: "S S plus" },
      ]),
    ).toBe("Keep the whole sentence. S S plus wins.");
  });

  test("never uses the legacy free-form spoken message", () => {
    expect(
      spokenMessageFromWritten("The displayed line stays complete.", {
        spoken_message: "A different sentence entirely.",
      }),
    ).toBe("The displayed line stays complete.");
  });
});
