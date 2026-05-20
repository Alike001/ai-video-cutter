import {
  suggestCutsResponseSchema,
  type SuggestCutsResponse,
  type Sentence,
} from "@/lib/types";

const TIMEOUT_MS = 30000;

export async function fetchSuggestions(
  sentences: Sentence[]
): Promise<SuggestCutsResponse["suggestions"] | null> {
  const eligible = sentences
    .filter((s) => s.suggestedKeep)
    .map((s) => ({
      id: s.id,
      text: s.text,
      startSec: s.startSec,
      endSec: s.endSec,
    }));

  if (eligible.length === 0) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("/api/suggest-cuts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentences: eligible }),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timeout);
    return null;
  }
  clearTimeout(timeout);

  if (!response.ok) return null;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }

  const parsed = suggestCutsResponseSchema.safeParse(body);
  if (!parsed.success) return null;
  return parsed.data.suggestions;
}

export function mergeSuggestions(
  sentences: Sentence[],
  suggestions: SuggestCutsResponse["suggestions"]
): Sentence[] {
  const map = new Map(suggestions.map((s) => [s.id, s]));
  return sentences.map((s) => {
    const sugg = map.get(s.id);
    if (!sugg) return s;
    if (sugg.suggestedKeep) return s;
    return {
      ...s,
      suggestedKeep: false,
      keep: false,
      reason: sugg.reason ?? "low_value",
    };
  });
}
