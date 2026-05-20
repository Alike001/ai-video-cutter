  export function formatTime(sec: number): string {
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  export function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
    if (ranges.length === 0) return [];
    const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const last = merged[merged.length - 1];
      const next = sorted[i];
      if (next[0] - last[1] <= 0.05) {
        last[1] = Math.max(last[1], next[1]);
      } else {
        merged.push([...next]);
      }
    }
    return merged;
  }

  export function debounce<T extends (...args: never[]) => unknown>(
    fn: T,
    delayMs: number
  ): (...args: Parameters<T>) => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<T>) => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delayMs);
    };
  }

  export function uuid(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

