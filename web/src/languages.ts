/** Spoken languages offered in the UI (maps to Whisper ISO codes). */
export const LANGUAGE_OPTIONS = [
  { code: "bn", name: "Bengali" },
  { code: "hi", name: "Hindi" },
  { code: "en", name: "English" },
] as const;

const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  LANGUAGE_OPTIONS.flatMap(({ code, name }) => [
    [name.toLowerCase(), code],
    [code, code],
  ]),
);

/** API / pipeline value → UI state. */
export function parseLanguagesParam(value: string): {
  auto: boolean;
  codes: string[];
} {
  const trimmed = value.trim();
  if (trimmed.toLowerCase() === "auto") {
    return { auto: true, codes: [] };
  }
  const codes = trimmed
    .split(",")
    .map((part) => normalizeLanguageToken(part))
    .filter((code): code is string => !!code);
  return { auto: false, codes: [...new Set(codes)] };
}

/** UI selection → API / pipeline value. */
export function formatLanguagesParam(auto: boolean, codes: string[]): string {
  if (auto) return "auto";
  const unique = [...new Set(codes.map((c) => c.toLowerCase()))].filter(Boolean);
  return unique.join(",") || "auto";
}

function normalizeLanguageToken(token: string): string | null {
  const key = token.trim().toLowerCase();
  if (!key) return null;
  return NAME_TO_CODE[key] ?? (key.length === 2 ? key : null);
}

export function isKnownLanguageCode(code: string): boolean {
  return LANGUAGE_OPTIONS.some((l) => l.code === code);
}
