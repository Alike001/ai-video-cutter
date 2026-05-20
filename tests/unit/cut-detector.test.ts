import { describe, it, expect } from "vitest";
import { applyDeterministicCuts } from "@/lib/cut-detector";
import type { Sentence } from "@/lib/types";

function make(
  overrides: Partial<Sentence> & {
    id: string;
    text: string;
    startSec: number;
    endSec: number;
  }
): Sentence {
  return {
    keep: true,
    suggestedKeep: true,
    ...overrides,
  };
}

describe("applyDeterministicCuts", () => {
  it("marks pure-filler sentences as cut", () => {
    const sentences = [make({ id: "1", text: "Um.", startSec: 0, endSec: 0.5 })];
    const result = applyDeterministicCuts(sentences);
    expect(result[0].suggestedKeep).toBe(false);
    expect(result[0].keep).toBe(false);
    expect(result[0].reason).toBe("filler");
  });

  it("matches fillers with surrounding punctuation", () => {
    const sentences = [
      make({ id: "1", text: "Uh,", startSec: 0, endSec: 0.5 }),
      make({ id: "2", text: "you know.", startSec: 0.6, endSec: 1.2 }),
    ];
    const result = applyDeterministicCuts(sentences);
    expect(result[0].suggestedKeep).toBe(false);
    expect(result[1].suggestedKeep).toBe(false);
  });

  it("does NOT cut sentences with real content after a filler", () => {
    const sentences = [
      make({ id: "1", text: "Um so here's the thing.", startSec: 0, endSec: 2 }),
    ];
    const result = applyDeterministicCuts(sentences);
    expect(result[0].suggestedKeep).toBe(true);
  });

  it("preserves both sentences across a pause gap", () => {
    const sentences = [
      make({ id: "1", text: "Hello.", startSec: 0, endSec: 1 }),
      make({ id: "2", text: "World.", startSec: 3.0, endSec: 4 }),
    ];
    const result = applyDeterministicCuts(sentences);
    expect(result).toHaveLength(2);
    expect(result[0].keep).toBe(true);
    expect(result[1].keep).toBe(true);
  });

  it("leaves regular sentences untouched", () => {
    const sentences = [
      make({ id: "1", text: "Welcome to my channel.", startSec: 0, endSec: 2 }),
    ];
    const result = applyDeterministicCuts(sentences);
    expect(result[0]).toEqual(sentences[0]);
  });

  it("is case-insensitive on filler match", () => {
    const sentences = [make({ id: "1", text: "UM!", startSec: 0, endSec: 0.5 })];
    const result = applyDeterministicCuts(sentences);
    expect(result[0].suggestedKeep).toBe(false);
  });
});
