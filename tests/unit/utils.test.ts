 import { describe, it, expect, vi } from "vitest";
 import { formatTime, mergeRanges, debounce, uuid } from "@/lib/utils";

  describe("formatTime", () => {
    it("formats seconds as M:SS", () => {
      expect(formatTime(0)).toBe("0:00");
      expect(formatTime(12)).toBe("0:12");
      expect(formatTime(75)).toBe("1:15");
      expect(formatTime(605)).toBe("10:05");
    });

    it("handles fractional seconds by truncating", () => {
      expect(formatTime(12.7)).toBe("0:12");
    });
  });

  describe("mergeRanges", () => {
    it("merges contiguous ranges (gap <= 0.05s)", () => {
      expect(
        mergeRanges([
          [0, 1],
          [1, 2.5],
        ])
      ).toEqual([[0, 2.5]]);
    });

    it("keeps non-contiguous ranges separate", () => {
      expect(
        mergeRanges([
          [0, 1],
          [5, 6],
        ])
      ).toEqual([
        [0, 1],
        [5, 6],
      ]);
    });

    it("returns empty array for empty input", () => {
      expect(mergeRanges([])).toEqual([]);
    });

    it("sorts ranges by start before merging", () => {
      expect(
        mergeRanges([
          [5, 6],
          [0, 1],
        ])
      ).toEqual([
        [0, 1],
        [5, 6],
      ]);
    });
  });

  describe("debounce", () => {
    it("only calls the function after delay elapses without further calls", async () => {
      vi.useFakeTimers();
      const fn = vi.fn();
      const debounced = debounce(fn, 500);
      debounced("a");
      debounced("b");
      debounced("c");
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(500);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("c");
      vi.useRealTimers();
    });
  });

  describe("uuid", () => {
    it("returns a non-empty string", () => {
      expect(typeof uuid()).toBe("string");
      expect(uuid().length).toBeGreaterThan(10);
    });

    it("returns unique values", () => {
      const a = uuid();
      const b = uuid();
      expect(a).not.toBe(b);
    });
  });
