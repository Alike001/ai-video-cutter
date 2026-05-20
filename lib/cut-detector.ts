import type { Sentence } from "@/lib/types";

const FILLER_REGEX = /^(um|uh|like|you know|so|ah|hmm)[\s,.!?]*$/i;

export function applyDeterministicCuts(sentences: Sentence[]): Sentence[] {
  return sentences.map((s) => {
    if (FILLER_REGEX.test(s.text.trim())) {
      return { ...s, keep: false, suggestedKeep: false, reason: "filler" };
    }
    return s;
  });
}
