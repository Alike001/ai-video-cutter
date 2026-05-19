import { describe, it, expect } from "vitest";
import { suggestCutsResponseSchema, suggestCutsRequestSchema } from "@/lib/types";

  describe("suggestCutsRequestSchema", () => {
    it("accepts a valid sentence batch", () => {
      const parsed = suggestCutsRequestSchema.parse({
        sentences: [{ id: "s1", text: "Hello.", startSec: 0, endSec: 1 }],
      });
      expect(parsed.sentences).toHaveLength(1);
    });

    it("rejects empty sentences array", () => {
      expect(() => suggestCutsRequestSchema.parse({ sentences: [] })).toThrow();
    });

    it("rejects negative timestamps", () => {
      expect(() =>
        suggestCutsRequestSchema.parse({
          sentences: [{ id: "s1", text: "Hi.", startSec: -1, endSec: 1 }],
        })
      ).toThrow();
    });
  });

  describe("suggestCutsResponseSchema", () => {
    it("accepts a well-formed response", () => {
      const parsed = suggestCutsResponseSchema.parse({
        suggestions: [
          { id: "s1", suggestedKeep: true, reason: null },
          { id: "s2", suggestedKeep: false, reason: "bad_take" },
        ],
      });
      expect(parsed.suggestions).toHaveLength(2);
    });

    it("rejects unknown reason values", () => {
      expect(() =>
        suggestCutsResponseSchema.parse({
          suggestions: [{ id: "s1", suggestedKeep: false, reason: "weird" }],
        })
      ).toThrow();
    });

    it("allows reason to be null when suggestedKeep is true", () => {
      const parsed = suggestCutsResponseSchema.parse({
        suggestions: [{ id: "s1", suggestedKeep: true, reason: null }],
      });
      expect(parsed.suggestions[0].reason).toBeNull();
    });
  });

