export type PronunciationReplacement = {
  written: string;
  spoken: string;
};

const MAX_REPLACEMENTS = 12;
const MAX_WRITTEN_LENGTH = 24;
const MAX_SPOKEN_LENGTH = 64;

// The model may clarify only compact tokens that are genuinely ambiguous to
// TTS: numeric/symbolic forms (5.0, SS+, C++, v2) and all-cap acronyms (API).
// Ordinary words and phrases cannot pass this gate, so the spoken line cannot
// acquire, lose, or paraphrase a clause.
function isEligibleWrittenToken(token: string): boolean {
  if (
    token.length === 0 ||
    token.length > MAX_WRITTEN_LENGTH ||
    /\s/.test(token)
  )
    return false;
  return /[0-9+.#/@]/.test(token) || /^[A-Z]{2,8}$/.test(token);
}

function replacementList(value: unknown): PronunciationReplacement[] {
  if (!Array.isArray(value)) return [];
  const replacements: PronunciationReplacement[] = [];
  const seen = new Set<string>();
  for (const entry of value.slice(0, MAX_REPLACEMENTS)) {
    if (!entry || typeof entry !== "object") continue;
    const { written, spoken } = entry as Record<string, unknown>;
    if (
      typeof written !== "string" ||
      typeof spoken !== "string" ||
      !isEligibleWrittenToken(written) ||
      spoken.length === 0 ||
      spoken.length > MAX_SPOKEN_LENGTH ||
      seen.has(written)
    )
      continue;
    seen.add(written);
    replacements.push({ written, spoken });
  }
  return replacements;
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function spokenMessageFromWritten(
  writtenMessage: string,
  value: unknown,
): string {
  const replacements = replacementList(value).filter(({ written }) =>
    writtenMessage.includes(written),
  );
  if (replacements.length === 0) return writtenMessage;
  const byWritten = new Map(
    replacements.map(({ written, spoken }) => [written, spoken]),
  );
  const pattern = replacements
    .map(({ written }) => written)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  return writtenMessage.replace(
    new RegExp(pattern, "g"),
    (token) => byWritten.get(token) ?? token,
  );
}
