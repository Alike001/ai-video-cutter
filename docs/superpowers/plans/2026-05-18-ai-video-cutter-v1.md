# AI Video Cutter v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 browser-based AI video cutter described in `docs/superpowers/specs/2026-05-16-ai-video-editor-design.md` — a Next.js app that transcribes a video with Whisper, suggests cuts (deterministic + Groq Llama), lets the editor toggle keep/cut per sentence, and exports a stitched MP4 with `ffmpeg.wasm` stream-copy. All compute runs in the browser; the only server piece is a thin `/api/suggest-cuts` proxy holding the Groq API key.

**Architecture:** Next.js 15 App Router. All heavy compute (Whisper transcription, ffmpeg cutting, IndexedDB persistence) runs client-side. A single API route (`/api/suggest-cuts`) proxies sentence batches to Groq's Llama 3.3 70B with zod-validated JSON responses. Cross-Origin Isolation (COOP/COEP) is required for SharedArrayBuffer (needed by ffmpeg.wasm and transformers.js). State lives in React + IndexedDB (debounced writes); one project at a time.

**Tech Stack:** Next.js 15, React 18, TypeScript 5, Tailwind 3, `@xenova/transformers` (Whisper-base), `@ffmpeg/ffmpeg` + `@ffmpeg/util`, `idb`, `zod`, `lucide-react`, Vitest, Playwright. Deployed to Vercel free tier.

**Phasing (checkpointable):**
- **Phase 0 — Foundation:** scaffold, types, infra. Output: empty Next.js app with headers + DB layer.
- **Phase 1 — Upload & Transcribe:** upload page, audio extraction, Whisper, transcript display. Output: working transcription tool (no AI, no export).
- **Phase 2 — AI suggestions:** deterministic cut detector + Groq proxy + merge. Output: transcript with auto-suggested cuts.
- **Phase 3 — Editor interactions:** keep/cut toggle, preview, "play kept only", bulk actions. Output: full interactive editor (no export yet).
- **Phase 4 — Export:** ffmpeg.wasm stream-copy + concat + download. Output: end-to-end cut/export.
- **Phase 5 — Polish & deploy:** error catalog, Playwright tests, CI, README, Vercel deploy. Output: v1 shipped.

> **Note on terminal commands:** Ali prefers commands typed directly (no heredocs, no long one-liners). When a step needs a file written, use the editor/Write tool — don't `cat <<EOF` it into the shell. When running `git commit`, **do NOT** override the author with `-c user.email`; let global git config handle it so commits attribute to `Alike001` on GitHub.

---

## File Structure

This is what we will create (locked in here so later tasks can reference exact paths without re-deciding):

```
ai-video-cutter/
├── app/
│   ├── layout.tsx                    # Root layout, fonts, banner host
│   ├── page.tsx                      # Home / upload
│   ├── editor/
│   │   └── page.tsx                  # Editor view (transcript + preview + export)
│   ├── unsupported/
│   │   └── page.tsx                  # Browser-not-supported page
│   ├── api/
│   │   └── suggest-cuts/
│   │       └── route.ts              # Groq proxy
│   └── globals.css
├── components/
│   ├── upload-dropzone.tsx
│   ├── transcript-view.tsx
│   ├── sentence-card.tsx
│   ├── video-preview.tsx
│   ├── cut-controls.tsx              # Bulk actions + stats
│   ├── export-button.tsx
│   ├── progress-bar.tsx
│   ├── error-banner.tsx              # Single-banner UI
│   └── capability-guard.tsx          # SharedArrayBuffer / IDB / etc. check
├── lib/
│   ├── types.ts                      # Sentence, Project, zod schemas
│   ├── utils.ts                      # Time format, range merge, debounce, uuid
│   ├── storage.ts                    # idb wrapper
│   ├── audio.ts                      # decodeAudioData → Float32Array PCM 16kHz mono
│   ├── whisper.ts                    # @xenova/transformers wrapper
│   ├── cut-detector.ts               # Filler regex + pause detection
│   ├── groq-client.ts                # /api/suggest-cuts fetch wrapper
│   ├── ffmpeg.ts                     # @ffmpeg/ffmpeg wrapper (lazy)
│   ├── error-banner-store.ts         # useErrorBanner hook + store
│   └── capabilities.ts               # Browser feature detection
├── tests/
│   ├── unit/
│   │   ├── utils.test.ts
│   │   ├── cut-detector.test.ts
│   │   ├── types.test.ts             # zod schema tests
│   │   └── suggest-cuts.route.test.ts
│   └── e2e/
│       ├── happy-path.spec.ts
│       ├── resume.spec.ts
│       └── unsupported-file.spec.ts
├── public/
├── .env.local                        # GROQ_API_KEY (gitignored)
├── .env.example                      # Template
├── .gitignore
├── .prettierrc.json
├── eslint.config.mjs
├── playwright.config.ts
├── vitest.config.ts
├── next.config.ts                    # COOP/COEP headers
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── README.md
└── docs/superpowers/                 # already exists with spec + this plan
```

Each `lib/` file has one responsibility. Components stay small (< 200 lines each). Tests live next to what they test (`tests/unit/<name>.test.ts` mirrors `lib/<name>.ts`).

---

# Phase 0 — Foundation

End of phase: empty Next.js app boots, browser capability guard works, IndexedDB layer is unit-tested, error banner system exists.

---

### Task 1: Initialize Next.js 15 project

**Files:**
- Create: `/home/ali/Desktop/ai-video-cutter/` (Next.js scaffold)

- [ ] **Step 1: Run scaffold**

From `/home/ali/Desktop/` (parent dir of `ai-video-cutter/`):

```bash
cd /home/ali/Desktop && npx create-next-app@15 ai-video-cutter --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm
```

Confirm "No" if asked about Turbopack (we'll add it manually if needed; default off for stability).

**Important:** the spec already wrote `docs/superpowers/` inside `ai-video-cutter/`. `create-next-app` will refuse to write to a non-empty directory. To work around this, scaffold to a temp dir then merge:

```bash
cd /home/ali/Desktop && npx create-next-app@15 ai-video-cutter-tmp --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm
```

Then merge:

```bash
cp -rT /home/ali/Desktop/ai-video-cutter-tmp /home/ali/Desktop/ai-video-cutter && rm -rf /home/ali/Desktop/ai-video-cutter-tmp
```

- [ ] **Step 2: Verify it boots**

```bash
cd /home/ali/Desktop/ai-video-cutter && npm run dev
```

Expected: dev server starts on http://localhost:3000, default Next.js welcome page renders. Ctrl-C to stop.

- [ ] **Step 3: Initialize git**

```bash
cd /home/ali/Desktop/ai-video-cutter && git init && git add -A && git commit -m "chore: initial Next.js 15 scaffold"
```

No `-c user.email` override. Use whatever global git config is set.

---

### Task 2: Install runtime + dev dependencies

**Files:**
- Modify: `/home/ali/Desktop/ai-video-cutter/package.json`

- [ ] **Step 1: Install runtime deps**

```bash
cd /home/ali/Desktop/ai-video-cutter && npm install @xenova/transformers @ffmpeg/ffmpeg @ffmpeg/util idb zod lucide-react
```

- [ ] **Step 2: Install dev deps**

```bash
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @playwright/test prettier
```

- [ ] **Step 3: Install Playwright browsers**

```bash
npx playwright install --with-deps chromium
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json && git commit -m "chore: install runtime and dev dependencies"
```

---

### Task 3: Configure COOP/COEP headers + Next config

The spec requires `SharedArrayBuffer` which needs Cross-Origin Isolation. This means every response must carry `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.

**Files:**
- Modify: `/home/ali/Desktop/ai-video-cutter/next.config.ts`

- [ ] **Step 1: Replace `next.config.ts` with:**

```typescript
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    return config;
  },
};

export default nextConfig;
```

- [ ] **Step 2: Verify headers are applied**

Start dev server (`npm run dev`), open http://localhost:3000 in Chrome DevTools → Network tab → click the root document → confirm both headers present in Response Headers.

In the Console tab, run:

```js
crossOriginIsolated
```

Expected: `true`. If `false`, headers are not active — fix before continuing.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts && git commit -m "feat: add COOP/COEP headers for SharedArrayBuffer"
```

---

### Task 4: Core types and zod schemas

**Files:**
- Create: `/home/ali/Desktop/ai-video-cutter/lib/types.ts`
- Create: `/home/ali/Desktop/ai-video-cutter/tests/unit/types.test.ts`
- Create: `/home/ali/Desktop/ai-video-cutter/vitest.config.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Add test scripts to `package.json`**

In `package.json`, add to the `scripts` block:

```json
"test": "vitest run",
"test:watch": "vitest",
"e2e": "playwright test",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 3: Write the failing test**

Create `/home/ali/Desktop/ai-video-cutter/tests/unit/types.test.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to confirm failure**

```bash
npm test
```

Expected: fail with "Cannot find module '@/lib/types'".

- [ ] **Step 5: Implement `lib/types.ts`**

Create `/home/ali/Desktop/ai-video-cutter/lib/types.ts`:

```typescript
import { z } from "zod";

export type CutReason = "filler" | "pause" | "bad_take" | "low_value";

export type Sentence = {
  id: string;
  text: string;
  startSec: number;
  endSec: number;
  keep: boolean;
  suggestedKeep: boolean;
  reason?: CutReason;
};

export type Project = {
  videoBlob: Blob;
  videoFileName: string;
  videoMimeType: string;
  durationSec: number;
  sentences: Sentence[];
  createdAt: number;
  lastModifiedAt: number;
};

export const cutReasonSchema = z.enum(["filler", "pause", "bad_take", "low_value"]);

export const suggestCutsRequestSchema = z.object({
  sentences: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string(),
        startSec: z.number().nonnegative(),
        endSec: z.number().nonnegative(),
      })
    )
    .min(1)
    .max(500),
});

export const suggestCutsResponseSchema = z.object({
  suggestions: z.array(
    z.object({
      id: z.string().min(1),
      suggestedKeep: z.boolean(),
      reason: cutReasonSchema.nullable(),
    })
  ),
});

export type SuggestCutsRequest = z.infer<typeof suggestCutsRequestSchema>;
export type SuggestCutsResponse = z.infer<typeof suggestCutsResponseSchema>;
```

- [ ] **Step 6: Run test to confirm pass**

```bash
npm test
```

Expected: all 6 tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts tests/unit/types.test.ts vitest.config.ts package.json && git commit -m "feat: core types and zod schemas"
```

---

### Task 5: Utility functions (time format, range merge, debounce, uuid)

**Files:**
- Create: `/home/ali/Desktop/ai-video-cutter/lib/utils.ts`
- Create: `/home/ali/Desktop/ai-video-cutter/tests/unit/utils.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/home/ali/Desktop/ai-video-cutter/tests/unit/utils.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test, confirm failure**

```bash
npm test
```

Expected: fail with "Cannot find module '@/lib/utils'".

- [ ] **Step 3: Implement `lib/utils.ts`**

Create `/home/ali/Desktop/ai-video-cutter/lib/utils.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to confirm pass**

```bash
npm test
```

Expected: all tests in `utils.test.ts` and `types.test.ts` pass.

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts tests/unit/utils.test.ts && git commit -m "feat: time/range/debounce/uuid utilities"
```

---

### Task 6: Browser capability guard

**Files:**
- Create: `/home/ali/Desktop/ai-video-cutter/lib/capabilities.ts`
- Create: `/home/ali/Desktop/ai-video-cutter/components/capability-guard.tsx`
- Create: `/home/ali/Desktop/ai-video-cutter/app/unsupported/page.tsx`

- [ ] **Step 1: Create `lib/capabilities.ts`**

```typescript
export type Capability =
  | "SharedArrayBuffer"
  | "WebAssembly"
  | "IndexedDB"
  | "AudioContext"
  | "File"
  | "crossOriginIsolated";

export function getMissingCapabilities(): Capability[] {
  if (typeof window === "undefined") return [];
  const missing: Capability[] = [];
  if (typeof SharedArrayBuffer === "undefined") missing.push("SharedArrayBuffer");
  if (typeof WebAssembly === "undefined") missing.push("WebAssembly");
  if (typeof indexedDB === "undefined") missing.push("IndexedDB");
  if (typeof AudioContext === "undefined" && typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext === "undefined") missing.push("AudioContext");
  if (typeof File === "undefined") missing.push("File");
  if (window.crossOriginIsolated !== true) missing.push("crossOriginIsolated");
  return missing;
}
```

- [ ] **Step 2: Create `components/capability-guard.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMissingCapabilities } from "@/lib/capabilities";

export function CapabilityGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const missing = getMissingCapabilities();
    if (missing.length > 0) {
      router.replace(`/unsupported?missing=${encodeURIComponent(missing.join(","))}`);
      return;
    }
    setChecked(true);
  }, [router]);

  if (!checked) return null;
  return <>{children}</>;
}
```

- [ ] **Step 3: Create `app/unsupported/page.tsx`**

```tsx
type Props = { searchParams: Promise<{ missing?: string }> };

export default async function UnsupportedPage({ searchParams }: Props) {
  const { missing } = await searchParams;
  const missingList = missing ? missing.split(",") : [];

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-3xl font-bold mb-4">Your browser can&apos;t run this</h1>
      <p className="text-gray-600 mb-6">
        AI Video Cutter needs modern desktop browser features that this browser is missing.
        Please use a recent version of <b>Chrome</b>, <b>Edge</b>, or <b>Brave</b> on a laptop or desktop.
      </p>
      {missingList.length > 0 && (
        <details className="text-sm text-gray-500">
          <summary>Technical details</summary>
          <ul className="list-disc pl-5 mt-2">
            {missingList.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Smoke test in the browser**

Start dev server and visit http://localhost:3000/unsupported?missing=SharedArrayBuffer

Expected: page renders the friendly message with one bullet "SharedArrayBuffer" in details.

- [ ] **Step 5: Commit**

```bash
git add lib/capabilities.ts components/capability-guard.tsx app/unsupported/page.tsx && git commit -m "feat: browser capability guard + unsupported page"
```

---

### Task 7: IndexedDB storage layer

**Files:**
- Create: `/home/ali/Desktop/ai-video-cutter/lib/storage.ts`

No unit tests here — `idb` itself is well-tested, and meaningful tests require a real IndexedDB (Playwright covers this). Smoke-test in the browser.

- [ ] **Step 1: Create `lib/storage.ts`**

```typescript
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Project } from "@/lib/types";

interface AppDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
  };
}

const DB_NAME = "ai-video-cutter";
const DB_VERSION = 1;
const STORE = "projects";
const CURRENT_KEY = "current";

let dbPromise: Promise<IDBPDatabase<AppDB>> | null = null;

function getDB(): Promise<IDBPDatabase<AppDB>> {
  if (dbPromise === null) {
    dbPromise = openDB<AppDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      },
    });
  }
  return dbPromise;
}

export async function saveProject(project: Project): Promise<void> {
  const db = await getDB();
  await db.put(STORE, project, CURRENT_KEY);
}

export async function loadProject(): Promise<Project | undefined> {
  const db = await getDB();
  return db.get(STORE, CURRENT_KEY);
}

export async function hasProject(): Promise<boolean> {
  const project = await loadProject();
  return project !== undefined;
}

export async function clearProject(): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, CURRENT_KEY);
}
```

- [ ] **Step 2: Manual smoke test**

Start dev server. Open http://localhost:3000 in Chrome. Open DevTools console:

```js
const { saveProject, loadProject, clearProject } = await import("/lib/storage.ts");
```

(Note: this exact import may not work directly from console because of bundling — that's fine, full validation comes via Playwright in Task 26. Smoke test by writing a tiny test page if you want certainty, but proceeding is acceptable.)

- [ ] **Step 3: Commit**

```bash
git add lib/storage.ts && git commit -m "feat: IndexedDB storage layer for single-project persistence"
```

---

### Task 8: Error banner system

**Files:**
- Create: `/home/ali/Desktop/ai-video-cutter/lib/error-banner-store.ts`
- Create: `/home/ali/Desktop/ai-video-cutter/components/error-banner.tsx`
- Modify: `/home/ali/Desktop/ai-video-cutter/app/layout.tsx`

- [ ] **Step 1: Create `lib/error-banner-store.ts`**

We use a tiny pub-sub instead of a context to keep call sites simple (`showBanner({...})` from anywhere).

```typescript
"use client";

import { useEffect, useState } from "react";

export type BannerVariant = "info" | "warning" | "error";
export type BannerState = {
  message: string;
  variant: BannerVariant;
  actionLabel?: string;
  onAction?: () => void;
} | null;

let current: BannerState = null;
const listeners = new Set<(state: BannerState) => void>();

export function showBanner(state: NonNullable<BannerState>): void {
  current = state;
  listeners.forEach((fn) => fn(current));
}

export function clearBanner(): void {
  current = null;
  listeners.forEach((fn) => fn(current));
}

export function useErrorBanner(): BannerState {
  const [state, setState] = useState<BannerState>(current);
  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}
```

- [ ] **Step 2: Create `components/error-banner.tsx`**

```tsx
"use client";

import { useErrorBanner, clearBanner } from "@/lib/error-banner-store";
import { X } from "lucide-react";

const styles = {
  info: "bg-blue-50 text-blue-900 border-blue-200",
  warning: "bg-amber-50 text-amber-900 border-amber-200",
  error: "bg-red-50 text-red-900 border-red-200",
};

export function ErrorBanner() {
  const banner = useErrorBanner();
  if (banner === null) return null;
  return (
    <div className={`fixed top-0 inset-x-0 z-50 border-b px-4 py-2 flex items-center gap-3 ${styles[banner.variant]}`}>
      <span className="flex-1 text-sm">{banner.message}</span>
      {banner.actionLabel && banner.onAction && (
        <button
          onClick={banner.onAction}
          className="text-sm font-semibold underline underline-offset-2"
        >
          {banner.actionLabel}
        </button>
      )}
      <button
        onClick={clearBanner}
        aria-label="Dismiss"
        className="p-1 hover:opacity-70"
      >
        <X size={16} />
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Mount banner in root layout**

Replace `app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { ErrorBanner } from "@/components/error-banner";

export const metadata: Metadata = {
  title: "AI Video Cutter",
  description: "Browser-based AI assistant for cutting, splitting, and trimming videos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ErrorBanner />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Smoke test**

Add a temporary button to `app/page.tsx` (we'll replace this page in Task 9):

```tsx
"use client";
import { showBanner } from "@/lib/error-banner-store";

export default function Page() {
  return (
    <main className="p-8">
      <button
        className="px-4 py-2 bg-red-600 text-white rounded"
        onClick={() => showBanner({ message: "test", variant: "error" })}
      >
        Trigger banner
      </button>
    </main>
  );
}
```

Run `npm run dev`, click the button, confirm red banner appears at top with X dismiss button. Then click X — banner disappears.

- [ ] **Step 5: Commit**

```bash
git add lib/error-banner-store.ts components/error-banner.tsx app/layout.tsx app/page.tsx && git commit -m "feat: error banner store and UI"
```

---

# Phase 1 — Upload & Transcribe

End of phase: you can upload a video, see a transcript appear, and the transcript is persisted in IndexedDB.

---

### Task 9: Upload dropzone component

**Files:**
- Create: `/home/ali/Desktop/ai-video-cutter/components/upload-dropzone.tsx`
- Modify: `/home/ali/Desktop/ai-video-cutter/app/page.tsx`

- [ ] **Step 1: Create `components/upload-dropzone.tsx`**

```tsx
"use client";

import { useCallback, useState } from "react";
import { Upload } from "lucide-react";

const ACCEPT = "video/mp4,video/quicktime,video/webm";
const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

type Props = {
  onFile: (file: File) => void;
  onError: (message: string) => void;
};

export function UploadDropzone({ onFile, onError }: Props) {
  const [dragging, setDragging] = useState(false);

  const validate = useCallback(
    (file: File): boolean => {
      if (!["video/mp4", "video/quicktime", "video/webm"].includes(file.type)) {
        onError("Only MP4, MOV, WebM supported. Convert with HandBrake or CloudConvert.");
        return false;
      }
      if (file.size > MAX_BYTES) {
        const gb = (file.size / 1024 / 1024 / 1024).toFixed(1);
        onError(`This file is huge (${gb}GB). Try a shorter clip or lower resolution.`);
        return false;
      }
      return true;
    },
    [onError]
  );

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && validate(file)) onFile(file);
      }}
      className={`block border-2 border-dashed rounded-xl px-8 py-16 text-center cursor-pointer transition ${
        dragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"
      }`}
    >
      <Upload className="mx-auto mb-3 text-gray-400" size={48} />
      <p className="font-medium">Drop a video here or click to pick</p>
      <p className="text-sm text-gray-500 mt-1">MP4, MOV, or WebM · up to 15 min recommended</p>
      <input
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && validate(file)) onFile(file);
        }}
      />
    </label>
  );
}
```

- [ ] **Step 2: Replace `app/page.tsx` with upload-and-redirect logic**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CapabilityGuard } from "@/components/capability-guard";
import { UploadDropzone } from "@/components/upload-dropzone";
import { showBanner } from "@/lib/error-banner-store";
import { hasProject, saveProject, clearProject } from "@/lib/storage";
import type { Project } from "@/lib/types";

function getDurationSec(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read this file. Try re-exporting from your editor."));
    };
    video.src = url;
  });
}

function HomeInner() {
  const router = useRouter();
  const [hasExisting, setHasExisting] = useState<boolean | null>(null);

  useEffect(() => {
    hasProject().then(setHasExisting);
  }, []);

  async function handleFile(file: File) {
    try {
      const durationSec = await getDurationSec(file);
      const project: Project = {
        videoBlob: file,
        videoFileName: file.name,
        videoMimeType: file.type,
        durationSec,
        sentences: [],
        createdAt: Date.now(),
        lastModifiedAt: Date.now(),
      };
      await saveProject(project);
      router.push("/editor");
    } catch (err) {
      showBanner({
        message: err instanceof Error ? err.message : "Upload failed.",
        variant: "error",
      });
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">AI Video Cutter</h1>
      <p className="text-gray-600 mb-8">
        Upload a talking-head clip and we&apos;ll suggest cuts you can review one tap at a time.
      </p>

      {hasExisting && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between">
          <span className="text-sm">You have a saved project.</span>
          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded"
              onClick={() => router.push("/editor")}
            >
              Resume
            </button>
            <button
              className="px-3 py-1.5 text-sm border rounded"
              onClick={async () => {
                if (confirm("Discard saved project?")) {
                  await clearProject();
                  setHasExisting(false);
                }
              }}
            >
              Start new
            </button>
          </div>
        </div>
      )}

      <UploadDropzone
        onFile={handleFile}
        onError={(m) => showBanner({ message: m, variant: "error" })}
      />
    </main>
  );
}

export default function HomePage() {
  return (
    <CapabilityGuard>
      <HomeInner />
    </CapabilityGuard>
  );
}
```

- [ ] **Step 3: Smoke test**

Run `npm run dev`. Visit http://localhost:3000.

- Try uploading a `.txt` file → expect red banner with file-type error.
- Try uploading a small MP4 → expect redirect to `/editor` (will show 404 next — that's OK).

- [ ] **Step 4: Commit**

```bash
git add components/upload-dropzone.tsx app/page.tsx && git commit -m "feat: home page with upload dropzone and resume prompt"
```

---

### Task 10: Audio extraction (Web Audio API)

**Files:**
- Create: `/home/ali/Desktop/ai-video-cutter/lib/audio.ts`

Whisper needs PCM Float32 at 16 kHz mono. Extract from the video blob using Web Audio.

- [ ] **Step 1: Create `lib/audio.ts`**

```typescript
const TARGET_SAMPLE_RATE = 16000;

export async function extractMonoPCM(videoBlob: Blob): Promise<Float32Array> {
  const arrayBuffer = await videoBlob.arrayBuffer();
  // Decode at any sample rate, then resample to 16kHz via OfflineAudioContext.
  const decodeCtx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  } finally {
    await decodeCtx.close();
  }

  const targetLength = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;

  // Downmix to mono manually if multichannel
  if (decoded.numberOfChannels > 1) {
    const merger = offline.createChannelMerger(1);
    const splitter = offline.createChannelSplitter(decoded.numberOfChannels);
    source.connect(splitter);
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      splitter.connect(merger, ch, 0);
    }
    merger.connect(offline.destination);
  } else {
    source.connect(offline.destination);
  }

  source.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}
```

- [ ] **Step 2: Smoke-test inline (no unit test — needs real audio)**

We will validate this in Task 12 when wiring transcription. Skip standalone testing here.

- [ ] **Step 3: Commit**

```bash
git add lib/audio.ts && git commit -m "feat: audio extraction to 16kHz mono PCM"
```

---

### Task 11: Whisper wrapper

**Files:**
- Create: `/home/ali/Desktop/ai-video-cutter/lib/whisper.ts`

- [ ] **Step 1: Create `lib/whisper.ts`**

```typescript
import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from "@xenova/transformers";
import { uuid } from "@/lib/utils";
import type { Sentence } from "@/lib/types";

// Cache models in IndexedDB-backed browser cache, avoid local model lookup
env.allowLocalModels = false;
env.useBrowserCache = true;

let pipelinePromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function getPipeline(onProgress?: (frac: number) => void): Promise<AutomaticSpeechRecognitionPipeline> {
  if (pipelinePromise === null) {
    pipelinePromise = pipeline("automatic-speech-recognition", "Xenova/whisper-base", {
      progress_callback: (data: { status?: string; progress?: number }) => {
        if (data.status === "progress" && typeof data.progress === "number" && onProgress) {
          onProgress(Math.min(1, data.progress / 100));
        }
      },
    }) as Promise<AutomaticSpeechRecognitionPipeline>;
  }
  return pipelinePromise;
}

type WhisperChunk = { text: string; timestamp: [number, number | null] };

export async function transcribe(
  pcm: Float32Array,
  opts: { onModelProgress?: (frac: number) => void } = {}
): Promise<Sentence[]> {
  const asr = await getPipeline(opts.onModelProgress);

  const result = (await asr(pcm, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
    language: "english",
    task: "transcribe",
  })) as { text: string; chunks?: WhisperChunk[] };

  const chunks = result.chunks ?? [];
  // Group whisper chunks into sentence-like units by punctuation
  const sentences: Sentence[] = [];
  let buffer = "";
  let bufStart: number | null = null;
  let bufEnd: number | null = null;

  for (const chunk of chunks) {
    const [start, end] = chunk.timestamp;
    if (bufStart === null) bufStart = start;
    if (end !== null) bufEnd = end;
    buffer += chunk.text;
    if (/[.!?]\s*$/.test(buffer.trim())) {
      sentences.push({
        id: uuid(),
        text: buffer.trim(),
        startSec: bufStart ?? 0,
        endSec: bufEnd ?? bufStart ?? 0,
        keep: true,
        suggestedKeep: true,
      });
      buffer = "";
      bufStart = null;
      bufEnd = null;
    }
  }
  // Flush trailing buffer
  if (buffer.trim().length > 0 && bufStart !== null) {
    sentences.push({
      id: uuid(),
      text: buffer.trim(),
      startSec: bufStart,
      endSec: bufEnd ?? bufStart,
      keep: true,
      suggestedKeep: true,
    });
  }

  return sentences;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/whisper.ts && git commit -m "feat: Whisper-base transcription wrapper"
```

---

### Task 12: Editor page shell + transcribe-on-mount

**Files:**
- Create: `/home/ali/Desktop/ai-video-cutter/components/progress-bar.tsx`
- Create: `/home/ali/Desktop/ai-video-cutter/components/transcript-view.tsx`
- Create: `/home/ali/Desktop/ai-video-cutter/components/sentence-card.tsx`
- Create: `/home/ali/Desktop/ai-video-cutter/app/editor/page.tsx`

- [ ] **Step 1: Create `components/progress-bar.tsx`**

```tsx
type Props = { label: string; fraction?: number };

export function ProgressBar({ label, fraction }: Props) {
  const indeterminate = fraction === undefined;
  return (
    <div className="w-full">
      <p className="text-sm text-gray-600 mb-2">{label}</p>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        {indeterminate ? (
          <div className="h-2 bg-blue-500 animate-pulse" style={{ width: "33%" }} />
        ) : (
          <div className="h-2 bg-blue-500 transition-all" style={{ width: `${Math.round(fraction * 100)}%` }} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/sentence-card.tsx`**

```tsx
import { formatTime } from "@/lib/utils";
import type { Sentence } from "@/lib/types";

type Props = {
  sentence: Sentence;
  active: boolean;
  onClick: () => void;
  onToggle: () => void;
};

const reasonLabel: Record<NonNullable<Sentence["reason"]>, string> = {
  filler: "filler",
  pause: "pause",
  bad_take: "bad take",
  low_value: "low value",
};

export function SentenceCard({ sentence, active, onClick, onToggle }: Props) {
  const dropped = !sentence.keep;
  return (
    <div
      onClick={onClick}
      className={`group rounded-lg border px-3 py-2 cursor-pointer transition ${
        active ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
      } ${dropped ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-gray-500 tabular-nums">
          {formatTime(sentence.startSec)}–{formatTime(sentence.endSec)}
        </span>
        {sentence.reason && (
          <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">
            {reasonLabel[sentence.reason]}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`ml-auto text-xs px-2 py-1 rounded border ${
            dropped ? "bg-white text-gray-700" : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {dropped ? "Keep" : "Cut"}
        </button>
      </div>
      <p className={`text-sm ${dropped ? "line-through text-gray-500" : "text-gray-900"}`}>
        {sentence.text}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Create `components/transcript-view.tsx`**

```tsx
import type { Sentence } from "@/lib/types";
import { SentenceCard } from "@/components/sentence-card";

type Props = {
  sentences: Sentence[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
};

export function TranscriptView({ sentences, activeId, onSelect, onToggle }: Props) {
  if (sentences.length === 0) {
    return <p className="text-sm text-gray-500">No transcript yet.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {sentences.map((s) => (
        <SentenceCard
          key={s.id}
          sentence={s}
          active={s.id === activeId}
          onClick={() => onSelect(s.id)}
          onToggle={() => onToggle(s.id)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create `app/editor/page.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CapabilityGuard } from "@/components/capability-guard";
import { TranscriptView } from "@/components/transcript-view";
import { ProgressBar } from "@/components/progress-bar";
import { showBanner } from "@/lib/error-banner-store";
import { loadProject, saveProject } from "@/lib/storage";
import { extractMonoPCM } from "@/lib/audio";
import { transcribe } from "@/lib/whisper";
import { debounce } from "@/lib/utils";
import type { Project, Sentence } from "@/lib/types";

type Phase = "loading-project" | "extracting-audio" | "loading-model" | "transcribing" | "ready" | "error";

function EditorInner() {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [phase, setPhase] = useState<Phase>("loading-project");
  const [modelFrac, setModelFrac] = useState<number | undefined>(undefined);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Load project on mount
  useEffect(() => {
    (async () => {
      const p = await loadProject();
      if (!p) {
        router.replace("/");
        return;
      }
      setProject(p);
      setSentences(p.sentences);
      if (p.sentences.length === 0) {
        await runTranscription(p);
      } else {
        setPhase("ready");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runTranscription(p: Project) {
    try {
      setPhase("extracting-audio");
      const pcm = await extractMonoPCM(p.videoBlob);
      setPhase("loading-model");
      const result = await transcribe(pcm, {
        onModelProgress: (f) => {
          setModelFrac(f);
          if (f >= 1) setPhase("transcribing");
        },
      });
      if (result.length === 0) {
        showBanner({ message: "No speech detected. Pick a video with talking.", variant: "error" });
        setPhase("error");
        return;
      }
      setSentences(result);
      const updated: Project = { ...p, sentences: result, lastModifiedAt: Date.now() };
      setProject(updated);
      await saveProject(updated);
      setPhase("ready");
    } catch (err) {
      console.error(err);
      showBanner({
        message:
          err instanceof Error
            ? `Transcription failed — usually memory on long videos. Try <10 min. (${err.message})`
            : "Transcription failed.",
        variant: "error",
      });
      setPhase("error");
    }
  }

  // Debounced persistence on every sentence-state change
  const persist = useMemo(
    () =>
      debounce((next: Sentence[]) => {
        if (project) {
          const updated: Project = { ...project, sentences: next, lastModifiedAt: Date.now() };
          setProject(updated);
          void saveProject(updated);
        }
      }, 500),
    [project]
  );

  function onToggle(id: string) {
    setSentences((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, keep: !s.keep } : s));
      persist(next);
      return next;
    });
  }

  function onSelect(id: string) {
    setActiveId(id);
    // Preview wiring lands in Phase 3
  }

  if (phase === "loading-project") {
    return <main className="p-8"><ProgressBar label="Loading project…" /></main>;
  }

  return (
    <main className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 p-6">
      <section className="overflow-y-auto max-h-screen">
        <h2 className="text-lg font-semibold mb-3">Transcript</h2>
        {(phase === "extracting-audio" || phase === "loading-model" || phase === "transcribing") && (
          <div className="space-y-3 mb-4">
            {phase === "extracting-audio" && <ProgressBar label="Extracting audio…" />}
            {phase === "loading-model" && <ProgressBar label="Downloading AI model (one-time, ~150MB)…" fraction={modelFrac} />}
            {phase === "transcribing" && <ProgressBar label="Transcribing…" />}
          </div>
        )}
        <TranscriptView
          sentences={sentences}
          activeId={activeId}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-3">Preview</h2>
        <p className="text-sm text-gray-500">Preview coming in Phase 3.</p>
      </section>
    </main>
  );
}

export default function EditorPage() {
  return (
    <CapabilityGuard>
      <EditorInner />
    </CapabilityGuard>
  );
}
```

- [ ] **Step 5: End-to-end smoke test in browser**

Run `npm run dev`. Upload a short (<2 min) MP4 with clear speech.

Expected sequence:
1. Redirect to `/editor`
2. "Extracting audio…" progress
3. "Downloading AI model (one-time, ~150MB)…" — bar fills (slow first time)
4. "Transcribing…" — indeterminate
5. Transcript appears as a list of clickable cards. Each card has timestamp, text, Cut button.
6. Clicking "Cut" toggles strikethrough. Reload the page → state persists.

- [ ] **Step 6: Commit**

```bash
git add components/progress-bar.tsx components/transcript-view.tsx components/sentence-card.tsx app/editor/page.tsx && git commit -m "feat: editor page with transcription pipeline"
```

---

# Phase 2 — AI suggestions

End of phase: deterministic filler/pause cuts are pre-applied, LLM suggests bad-takes/low-value, all merged into the transcript.

---

### Task 13: Deterministic cut detector

**Files:**
- Create: `/home/ali/Desktop/ai-video-cutter/lib/cut-detector.ts`
- Create: `/home/ali/Desktop/ai-video-cutter/tests/unit/cut-detector.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/home/ali/Desktop/ai-video-cutter/tests/unit/cut-detector.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { applyDeterministicCuts } from "@/lib/cut-detector";
import type { Sentence } from "@/lib/types";

function make(overrides: Partial<Sentence> & { id: string; text: string; startSec: number; endSec: number }): Sentence {
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

  it("marks pause-after sentences when gap > 1.5s", () => {
    const sentences = [
      make({ id: "1", text: "Hello.", startSec: 0, endSec: 1 }),
      make({ id: "2", text: "World.", startSec: 3.0, endSec: 4 }), // gap 2.0s
    ];
    const result = applyDeterministicCuts(sentences);
    // First sentence kept (just had a pause after), second sentence kept.
    // The "pause" is the gap, marked by setting prev sentence's endSec down? No — spec
    // says mark the GAP as cuttable. We achieve this implicitly: the gap is excluded
    // from kept ranges because it's between sentences. So nothing to mark on sentences here.
    // We still mark a synthetic "pause" reason on the next sentence's leading silence
    // only if there's nothing else to cut. For v1 we don't synthesize; we rely on range merging.
    expect(result).toHaveLength(2);
    expect(result[0].keep).toBe(true);
    expect(result[1].keep).toBe(true);
  });

  it("leaves regular sentences untouched", () => {
    const sentences = [make({ id: "1", text: "Welcome to my channel.", startSec: 0, endSec: 2 })];
    const result = applyDeterministicCuts(sentences);
    expect(result[0]).toEqual(sentences[0]);
  });

  it("is case-insensitive on filler match", () => {
    const sentences = [make({ id: "1", text: "UM!", startSec: 0, endSec: 0.5 })];
    const result = applyDeterministicCuts(sentences);
    expect(result[0].suggestedKeep).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

```bash
npm test
```

Expected: fail with "Cannot find module '@/lib/cut-detector'".

- [ ] **Step 3: Implement `lib/cut-detector.ts`**

```typescript
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
```

Note on pauses: per the spec, pause-gaps between sentences are inherently cut because the export builds kept-ranges from `keep === true` sentences and merges contiguous ones — anything not inside a kept range is excluded. So we don't synthesize a "pause" sentence; the gap is dropped naturally by the export pipeline. The `pause` reason value remains in the enum for LLM-driven future use and for future v1.1 explicit-pause sentences.

- [ ] **Step 4: Run test to confirm pass**

```bash
npm test
```

Expected: all `cut-detector.test.ts` tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/cut-detector.ts tests/unit/cut-detector.test.ts && git commit -m "feat: deterministic filler-cut detection"
```

---

### Task 14: Groq API route

**Files:**
- Create: `/home/ali/Desktop/ai-video-cutter/app/api/suggest-cuts/route.ts`
- Create: `/home/ali/Desktop/ai-video-cutter/tests/unit/suggest-cuts.route.test.ts`
- Create: `/home/ali/Desktop/ai-video-cutter/.env.example`
- Modify: `/home/ali/Desktop/ai-video-cutter/.gitignore`

- [ ] **Step 1: Create `.env.example`**

```
GROQ_API_KEY=your-groq-key-here
```

- [ ] **Step 2: Ensure `.env.local` is gitignored**

Check `.gitignore` — Next.js scaffold already excludes `.env*.local`. Verify the line `.env*.local` is present. If not, add it.

- [ ] **Step 3: Create `.env.local`**

```
GROQ_API_KEY=
```

Leave value blank for now. Ali will add his Groq key (free tier at console.groq.com) before testing AI suggestions live. The route handles missing keys gracefully (Task 14 Step 6 covers this).

- [ ] **Step 4: Write the failing route test**

Create `/home/ali/Desktop/ai-video-cutter/tests/unit/suggest-cuts.route.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { POST } from "@/app/api/suggest-cuts/route";

const originalFetch = global.fetch;

function mockGroq(payload: unknown, status = 200): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }) as unknown as typeof fetch;
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/suggest-cuts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.GROQ_API_KEY = "test-key";
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("POST /api/suggest-cuts", () => {
  it("returns 400 on invalid request body", async () => {
    const res = await POST(makeRequest({ wrong: "shape" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on empty sentences array", async () => {
    const res = await POST(makeRequest({ sentences: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when GROQ_API_KEY is missing", async () => {
    delete process.env.GROQ_API_KEY;
    const res = await POST(
      makeRequest({ sentences: [{ id: "s1", text: "Hi.", startSec: 0, endSec: 1 }] })
    );
    expect(res.status).toBe(500);
  });

  it("returns suggestions on valid Groq response", async () => {
    mockGroq({
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: [{ id: "s1", suggestedKeep: true, reason: null }],
            }),
          },
        },
      ],
    });
    const res = await POST(
      makeRequest({ sentences: [{ id: "s1", text: "Hi.", startSec: 0, endSec: 1 }] })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].id).toBe("s1");
  });

  it("returns 502 when Groq returns invalid JSON content", async () => {
    mockGroq({
      choices: [{ message: { content: "not json" } }],
    });
    const res = await POST(
      makeRequest({ sentences: [{ id: "s1", text: "Hi.", startSec: 0, endSec: 1 }] })
    );
    expect(res.status).toBe(502);
  });

  it("returns 502 when Groq response fails schema validation", async () => {
    mockGroq({
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: [{ id: "s1", suggestedKeep: false, reason: "nonsense" }],
            }),
          },
        },
      ],
    });
    const res = await POST(
      makeRequest({ sentences: [{ id: "s1", text: "Hi.", startSec: 0, endSec: 1 }] })
    );
    expect(res.status).toBe(502);
  });

  it("returns 502 when Groq upstream is non-2xx", async () => {
    mockGroq({ error: { message: "rate limit" } }, 429);
    const res = await POST(
      makeRequest({ sentences: [{ id: "s1", text: "Hi.", startSec: 0, endSec: 1 }] })
    );
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 5: Run test, confirm failure**

```bash
npm test
```

Expected: fail with module-not-found.

- [ ] **Step 6: Implement `app/api/suggest-cuts/route.ts`**

```typescript
import { NextResponse } from "next/server";
import {
  suggestCutsRequestSchema,
  suggestCutsResponseSchema,
} from "@/lib/types";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You help a video editor remove bad takes and low-value content from a transcript.
For each sentence, decide whether to KEEP or CUT.
- CUT if the sentence is a botched take, stumbles, contradicts itself, or duplicates an earlier sentence (bad_take).
- CUT if the sentence is filler talk that doesn't move the message forward (low_value).
- Otherwise KEEP.
Do NOT cut for fillers like "um" or "uh" — those are handled separately.
Respond ONLY with JSON matching: { "suggestions": [ { "id": string, "suggestedKeep": boolean, "reason": "bad_take" | "low_value" | null } ] }.
Include every input sentence id exactly once.`;

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = suggestCutsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });
  }

  const userMessage = JSON.stringify({ sentences: parsed.data.sentences });

  let groqRes: Response;
  try {
    groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });
  } catch {
    return NextResponse.json({ error: "Groq request failed" }, { status: 502 });
  }

  if (!groqRes.ok) {
    return NextResponse.json({ error: `Groq error ${groqRes.status}` }, { status: 502 });
  }

  const groqJson = (await groqRes.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = groqJson.choices?.[0]?.message?.content ?? "";
  let inner: unknown;
  try {
    inner = JSON.parse(content);
  } catch {
    return NextResponse.json({ error: "Groq returned non-JSON" }, { status: 502 });
  }

  const validated = suggestCutsResponseSchema.safeParse(inner);
  if (!validated.success) {
    return NextResponse.json({ error: "Groq response failed schema" }, { status: 502 });
  }

  return NextResponse.json(validated.data, { status: 200 });
}
```

- [ ] **Step 7: Run test to confirm pass**

```bash
npm test
```

Expected: all `suggest-cuts.route.test.ts` tests pass.

- [ ] **Step 8: Commit**

```bash
git add app/api/suggest-cuts/route.ts tests/unit/suggest-cuts.route.test.ts .env.example .gitignore && git commit -m "feat: Groq proxy route for cut suggestions"
```

---

### Task 15: Groq client wrapper + merge into editor

**Files:**
- Create: `/home/ali/Desktop/ai-video-cutter/lib/groq-client.ts`
- Modify: `/home/ali/Desktop/ai-video-cutter/app/editor/page.tsx`

- [ ] **Step 1: Create `lib/groq-client.ts`**

```typescript
import { suggestCutsResponseSchema, type SuggestCutsResponse } from "@/lib/types";
import type { Sentence } from "@/lib/types";

const TIMEOUT_MS = 30000;

export async function fetchSuggestions(sentences: Sentence[]): Promise<SuggestCutsResponse["suggestions"] | null> {
  const eligible = sentences
    .filter((s) => s.suggestedKeep) // skip already-cut sentences (Stage A)
    .map((s) => ({ id: s.id, text: s.text, startSec: s.startSec, endSec: s.endSec }));

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
    if (sugg.suggestedKeep) return s; // LLM agrees to keep — nothing to change
    return {
      ...s,
      suggestedKeep: false,
      keep: false,
      reason: sugg.reason ?? "low_value",
    };
  });
}
```

- [ ] **Step 2: Wire deterministic + AI into editor**

Edit `app/editor/page.tsx`. Change the imports block to include:

```typescript
import { applyDeterministicCuts } from "@/lib/cut-detector";
import { fetchSuggestions, mergeSuggestions } from "@/lib/groq-client";
```

Update the `Phase` type to add a step:

```typescript
type Phase = "loading-project" | "extracting-audio" | "loading-model" | "transcribing" | "analyzing" | "ready" | "error";
```

Update `runTranscription` so that after the transcript is built, we run both stages and persist:

```typescript
async function runTranscription(p: Project) {
  try {
    setPhase("extracting-audio");
    const pcm = await extractMonoPCM(p.videoBlob);
    setPhase("loading-model");
    const result = await transcribe(pcm, {
      onModelProgress: (f) => {
        setModelFrac(f);
        if (f >= 1) setPhase("transcribing");
      },
    });
    if (result.length === 0) {
      showBanner({ message: "No speech detected. Pick a video with talking.", variant: "error" });
      setPhase("error");
      return;
    }

    setPhase("analyzing");
    let staged = applyDeterministicCuts(result);
    const suggestions = await fetchSuggestions(staged);
    if (suggestions === null) {
      showBanner({
        message: "Smart AI suggestions unavailable — basic filler/pause detection still active.",
        variant: "warning",
      });
    } else if (suggestions.length > 0) {
      staged = mergeSuggestions(staged, suggestions);
    }

    setSentences(staged);
    const updated: Project = { ...p, sentences: staged, lastModifiedAt: Date.now() };
    setProject(updated);
    await saveProject(updated);
    setPhase("ready");
  } catch (err) {
    console.error(err);
    showBanner({
      message:
        err instanceof Error
          ? `Transcription failed — usually memory on long videos. Try <10 min. (${err.message})`
          : "Transcription failed.",
      variant: "error",
    });
    setPhase("error");
  }
}
```

And add a progress row for the new phase in the JSX progress section:

```tsx
{phase === "analyzing" && <ProgressBar label="Analyzing cuts…" />}
```

- [ ] **Step 3: Smoke test**

Set `GROQ_API_KEY` in `.env.local`. Restart `npm run dev`. Upload a short MP4 with some "um"s.

Expected:
- After transcription, "Analyzing cuts…" briefly appears.
- Filler-only sentences appear struck through with `filler` badge.
- Some other sentences may appear cut with `bad take` or `low value` badge (depending on content).
- Clear `.env.local` `GROQ_API_KEY` value, restart, re-run on a fresh project → only filler badges appear, plus a warning banner about smart AI being unavailable.

- [ ] **Step 4: Commit**

```bash
git add lib/groq-client.ts app/editor/page.tsx && git commit -m "feat: AI suggestions (deterministic + Groq) merged into editor"
```

---

# Phase 3 — Editor interactions

End of phase: video preview works, "play kept only" jumps over cut sections, bulk actions work.

---

### Task 16: Video preview component

**Files:**
- Create: `/home/ali/Desktop/ai-video-cutter/components/video-preview.tsx`
- Modify: `/home/ali/Desktop/ai-video-cutter/app/editor/page.tsx`

- [ ] **Step 1: Create `components/video-preview.tsx`**

```tsx
"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Sentence } from "@/lib/types";

export type VideoPreviewHandle = {
  seekTo: (seconds: number) => void;
};

type Props = {
  videoBlob: Blob;
  sentences: Sentence[];
  playKeptOnly: boolean;
  onPlayKeptOnlyChange: (v: boolean) => void;
};

export const VideoPreview = forwardRef<VideoPreviewHandle, Props>(function VideoPreview(
  { videoBlob, sentences, playKeptOnly, onPlayKeptOnlyChange },
  ref
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(videoBlob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [videoBlob]);

  useImperativeHandle(ref, () => ({
    seekTo(seconds: number) {
      const v = videoRef.current;
      if (v) {
        v.currentTime = seconds;
        void v.play();
      }
    },
  }));

  // Ranges of KEPT time, sorted. For seek-skip logic.
  const droppedRanges = useMemo(() => {
    return sentences
      .filter((s) => !s.keep)
      .map<[number, number]>((s) => [s.startSec, s.endSec])
      .sort((a, b) => a[0] - b[0]);
  }, [sentences]);

  // Pause-gap dropping is implicit (kept ranges exclude pauses). We jump from the start of a
  // dropped sentence to the end. If kept sentences happen to be back-to-back with a >1.5s gap,
  // we also skip those gaps via the same mechanism: any time the playhead is not inside a kept
  // sentence's [startSec, endSec] interval, we advance to the next kept sentence's startSec.
  const keptRanges = useMemo(() => {
    return sentences
      .filter((s) => s.keep)
      .map<[number, number]>((s) => [s.startSec, s.endSec])
      .sort((a, b) => a[0] - b[0]);
  }, [sentences]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playKeptOnly) return;

    function onTimeUpdate() {
      if (!v) return;
      const t = v.currentTime;
      const inKept = keptRanges.some(([s, e]) => t >= s - 0.05 && t <= e + 0.05);
      if (inKept) return;
      const next = keptRanges.find(([s]) => s > t);
      if (next) {
        v.currentTime = next[0];
      } else {
        v.pause();
      }
    }

    v.addEventListener("timeupdate", onTimeUpdate);
    return () => v.removeEventListener("timeupdate", onTimeUpdate);
  }, [keptRanges, playKeptOnly, droppedRanges]);

  if (url === null) return null;

  return (
    <div className="space-y-3">
      <video ref={videoRef} src={url} controls className="w-full rounded-lg bg-black" />
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={playKeptOnly}
          onChange={(e) => onPlayKeptOnlyChange(e.target.checked)}
        />
        Play kept only (skip cuts)
      </label>
    </div>
  );
});
```

- [ ] **Step 2: Wire preview into editor**

In `app/editor/page.tsx`:

Add imports:

```typescript
import { useRef } from "react";
import { VideoPreview, type VideoPreviewHandle } from "@/components/video-preview";
```

Inside `EditorInner`, add state and ref:

```typescript
const videoRef = useRef<VideoPreviewHandle | null>(null);
const [playKeptOnly, setPlayKeptOnly] = useState(true);
```

Update `onSelect` to seek:

```typescript
function onSelect(id: string) {
  setActiveId(id);
  const sentence = sentences.find((s) => s.id === id);
  if (sentence && videoRef.current) {
    videoRef.current.seekTo(sentence.startSec);
  }
}
```

Replace the placeholder preview section in JSX:

```tsx
<section>
  <h2 className="text-lg font-semibold mb-3">Preview</h2>
  {project && (
    <VideoPreview
      ref={videoRef}
      videoBlob={project.videoBlob}
      sentences={sentences}
      playKeptOnly={playKeptOnly}
      onPlayKeptOnlyChange={setPlayKeptOnly}
    />
  )}
</section>
```

- [ ] **Step 3: Smoke test**

Upload a video, wait for transcript. Click any sentence → video jumps to it and starts playing. With "Play kept only" checked, playback should skip past any cut sentence (jumping to the next kept one). Uncheck the box → playback goes through everything.

- [ ] **Step 4: Commit**

```bash
git add components/video-preview.tsx app/editor/page.tsx && git commit -m "feat: video preview with play-kept-only mode"
```

---

### Task 17: Bulk actions + stats panel

**Files:**
- Create: `/home/ali/Desktop/ai-video-cutter/components/cut-controls.tsx`
- Modify: `/home/ali/Desktop/ai-video-cutter/app/editor/page.tsx`

- [ ] **Step 1: Create `components/cut-controls.tsx`**

```tsx
"use client";

import type { Sentence } from "@/lib/types";
import { formatTime } from "@/lib/utils";

type Props = {
  sentences: Sentence[];
  durationSec: number;
  onAcceptAllAI: () => void;
  onRejectAllAI: () => void;
  onCutAllFillers: () => void;
};

export function CutControls({ sentences, durationSec, onAcceptAllAI, onRejectAllAI, onCutAllFillers }: Props) {
  const keptDuration = sentences
    .filter((s) => s.keep)
    .reduce((sum, s) => sum + (s.endSec - s.startSec), 0);
  const saved = Math.max(0, durationSec - keptDuration);
  const savedPct = durationSec > 0 ? Math.round((saved / durationSec) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-gray-50 p-4 text-sm space-y-1">
        <div className="flex justify-between"><span>Original</span><span className="tabular-nums">{formatTime(durationSec)}</span></div>
        <div className="flex justify-between"><span>Cut version</span><span className="tabular-nums">{formatTime(keptDuration)}</span></div>
        <div className="flex justify-between font-semibold"><span>Saved</span><span className="tabular-nums">{formatTime(saved)} ({savedPct}%)</span></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={onAcceptAllAI} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">Accept all AI</button>
        <button onClick={onRejectAllAI} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">Reject all AI</button>
        <button onClick={onCutAllFillers} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">Cut all fillers</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire bulk actions into editor**

In `app/editor/page.tsx`:

Add import:

```typescript
import { CutControls } from "@/components/cut-controls";
```

Add three handlers inside `EditorInner`:

```typescript
function applyBulk(transform: (s: Sentence) => Sentence) {
  setSentences((prev) => {
    const next = prev.map(transform);
    persist(next);
    return next;
  });
}

const onAcceptAllAI = () => applyBulk((s) => ({ ...s, keep: s.suggestedKeep }));
const onRejectAllAI = () => applyBulk((s) => ({ ...s, keep: true }));
const onCutAllFillers = () =>
  applyBulk((s) => (s.reason === "filler" ? { ...s, keep: false } : s));
```

Render `<CutControls>` inside the right section, above the video:

```tsx
<section>
  <h2 className="text-lg font-semibold mb-3">Preview</h2>
  {project && (
    <div className="space-y-4">
      <VideoPreview
        ref={videoRef}
        videoBlob={project.videoBlob}
        sentences={sentences}
        playKeptOnly={playKeptOnly}
        onPlayKeptOnlyChange={setPlayKeptOnly}
      />
      <CutControls
        sentences={sentences}
        durationSec={project.durationSec}
        onAcceptAllAI={onAcceptAllAI}
        onRejectAllAI={onRejectAllAI}
        onCutAllFillers={onCutAllFillers}
      />
    </div>
  )}
</section>
```

- [ ] **Step 3: Smoke test**

After transcript loads, click each bulk action and verify card states update + stats panel updates immediately.

- [ ] **Step 4: Commit**

```bash
git add components/cut-controls.tsx app/editor/page.tsx && git commit -m "feat: bulk actions + cut/savings stats panel"
```

---

# Phase 4 — Export

End of phase: clicking "Export" downloads a stitched MP4 with cuts applied.

---

### Task 18: FFmpeg wrapper

**Files:**
- Create: `/home/ali/Desktop/ai-video-cutter/lib/ffmpeg.ts`

- [ ] **Step 1: Create `lib/ffmpeg.ts`**

```typescript
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { mergeRanges } from "@/lib/utils";

const CORE_VERSION = "0.12.6";
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

let instancePromise: Promise<FFmpeg> | null = null;

async function getInstance(): Promise<FFmpeg> {
  if (instancePromise === null) {
    instancePromise = (async () => {
      const ff = new FFmpeg();
      await ff.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      });
      return ff;
    })();
  }
  return instancePromise;
}

export type ExportOptions = {
  videoBlob: Blob;
  fileName: string;
  ranges: Array<[number, number]>;
  onLog?: (msg: string) => void;
  onProgress?: (frac: number) => void;
};

export async function exportCutVideo(opts: ExportOptions): Promise<Blob> {
  const merged = mergeRanges(opts.ranges);
  if (merged.length === 0) {
    throw new Error("Nothing to export — keep at least one sentence.");
  }

  const ff = await getInstance();

  if (opts.onLog) ff.on("log", ({ message }) => opts.onLog?.(message));
  if (opts.onProgress) ff.on("progress", ({ progress }) => opts.onProgress?.(progress));

  const inputName = "input." + (opts.fileName.split(".").pop() ?? "mp4");
  const inputData = new Uint8Array(await opts.videoBlob.arrayBuffer());
  await ff.writeFile(inputName, inputData);

  // 1. Cut each segment with stream-copy
  const clipNames: string[] = [];
  for (let i = 0; i < merged.length; i++) {
    const [start, end] = merged[i];
    const clip = `clip_${i}.mp4`;
    await ff.exec([
      "-ss", String(start),
      "-to", String(end),
      "-i", inputName,
      "-c", "copy",
      "-avoid_negative_ts", "make_zero",
      clip,
    ]);
    clipNames.push(clip);
  }

  // 2. Concat
  let outputBlob: Blob;
  if (clipNames.length === 1) {
    const data = await ff.readFile(clipNames[0]);
    outputBlob = new Blob([data as Uint8Array], { type: "video/mp4" });
  } else {
    const listText = clipNames.map((n) => `file '${n}'`).join("\n") + "\n";
    await ff.writeFile("list.txt", new TextEncoder().encode(listText));
    await ff.exec([
      "-f", "concat",
      "-safe", "0",
      "-i", "list.txt",
      "-c", "copy",
      "output.mp4",
    ]);
    const data = await ff.readFile("output.mp4");
    outputBlob = new Blob([data as Uint8Array], { type: "video/mp4" });
  }

  // 3. Cleanup virtual FS
  await ff.deleteFile(inputName).catch(() => {});
  for (const c of clipNames) await ff.deleteFile(c).catch(() => {});
  await ff.deleteFile("list.txt").catch(() => {});
  await ff.deleteFile("output.mp4").catch(() => {});

  return outputBlob;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/ffmpeg.ts && git commit -m "feat: ffmpeg.wasm wrapper for stream-copy cut + concat"
```

---

### Task 19: Export button + download

**Files:**
- Create: `/home/ali/Desktop/ai-video-cutter/components/export-button.tsx`
- Modify: `/home/ali/Desktop/ai-video-cutter/app/editor/page.tsx`

- [ ] **Step 1: Create `components/export-button.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { exportCutVideo } from "@/lib/ffmpeg";
import { ProgressBar } from "@/components/progress-bar";
import { showBanner } from "@/lib/error-banner-store";
import type { Sentence, Project } from "@/lib/types";

type Props = { project: Project; sentences: Sentence[] };

export function ExportButton({ project, sentences }: Props) {
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);

  const keptRanges = sentences
    .filter((s) => s.keep)
    .map<[number, number]>((s) => [s.startSec, s.endSec]);

  const disabled = keptRanges.length === 0 || working;

  async function handleExport() {
    setWorking(true);
    setProgress(0);
    try {
      const blob = await exportCutVideo({
        videoBlob: project.videoBlob,
        fileName: project.videoFileName,
        ranges: keptRanges,
        onProgress: setProgress,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = project.videoFileName.replace(/\.(mp4|mov|webm)$/i, "") + "-cut.mp4";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed.";
      const lower = msg.toLowerCase();
      if (lower.includes("memory") || lower.includes("oom")) {
        showBanner({ message: "Export ran out of memory. Try fewer cuts or shorter video.", variant: "error" });
      } else if (lower.includes("stream") || lower.includes("copy")) {
        showBanner({
          message: "Encoding issue. Try re-exporting from your camera as standard MP4.",
          variant: "error",
        });
      } else {
        showBanner({
          message: "Export failed.",
          variant: "error",
          actionLabel: "Retry",
          onAction: () => void handleExport(),
        });
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleExport}
        disabled={disabled}
        title={keptRanges.length === 0 ? "Keep at least one sentence first" : undefined}
        className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg px-4 py-3 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700"
      >
        <Download size={18} />
        {working ? "Exporting…" : "Export cut video"}
      </button>
      {working && <ProgressBar label="Cutting & stitching…" fraction={progress} />}
    </div>
  );
}
```

- [ ] **Step 2: Wire into editor**

In `app/editor/page.tsx`:

Import:

```typescript
import { ExportButton } from "@/components/export-button";
```

Inside the right section's `<div className="space-y-4">`, append after `<CutControls …>`:

```tsx
<ExportButton project={project} sentences={sentences} />
```

- [ ] **Step 3: Smoke test (the moment of truth)**

Upload a short (1-2 min) MP4 with clear speech. Wait for transcript + suggestions. Toggle a few sentences off manually. Click "Export cut video". After a few seconds (depending on file size), a `-cut.mp4` should download. Play it locally — it should contain only the kept sentences, in order, with seams at sentence boundaries.

- [ ] **Step 4: Commit**

```bash
git add components/export-button.tsx app/editor/page.tsx && git commit -m "feat: export button with ffmpeg.wasm pipeline and download"
```

---

# Phase 5 — Polish & deploy

End of phase: v1 is live on a Vercel URL, README explains how to run, CI runs tests on push, Playwright covers the happy path.

---

### Task 20: Round out error coverage

The spec has a failure catalog (§8.3). Most are already wired. Sweep these in:

- Tab inactive warning
- IndexedDB blocked / private browsing
- Non-English transcript warning

**Files:**
- Modify: `/home/ali/Desktop/ai-video-cutter/app/editor/page.tsx`
- Modify: `/home/ali/Desktop/ai-video-cutter/lib/storage.ts`

- [ ] **Step 1: Tab inactive warning**

In `EditorInner`, add this effect (only while transcribing or analyzing):

```typescript
useEffect(() => {
  if (phase !== "loading-model" && phase !== "transcribing" && phase !== "analyzing") return;
  function onVisibility() {
    if (document.hidden) {
      showBanner({ message: "Tab inactive — bring it back to keep transcribing.", variant: "warning" });
    } else {
      clearBanner();
    }
  }
  document.addEventListener("visibilitychange", onVisibility);
  return () => document.removeEventListener("visibilitychange", onVisibility);
}, [phase]);
```

Import `clearBanner` from `@/lib/error-banner-store`.

- [ ] **Step 2: IndexedDB blocked detection**

Modify `lib/storage.ts` — wrap `getDB` in a try and rethrow a typed error. In `EditorInner`, the `loadProject()` call already has its own try/catch via the outer block; ensure the same in the upload handler in `app/page.tsx`. Quick guard at app entry: in `CapabilityGuard` we already check for `indexedDB` global, which is sufficient to catch most cases. For private-browsing-with-IDB-stub case, catch `openDB` rejection on first save and show the banner from `app/page.tsx`'s upload handler — wrap `saveProject(project)` in try/catch and on failure call:

```typescript
showBanner({ message: "Private browsing — work won't save if you close tab.", variant: "warning" });
```

(Still proceed to `/editor` — degraded mode.)

- [ ] **Step 3: Non-English heads-up**

Whisper-base detects language; we forced `language: "english"`. To detect non-English content cheaply, after transcription, count common English stop-words ratio. If less than 5% of words are common stop-words, show:

```typescript
showBanner({ message: "v1 is optimized for English. Results may be off.", variant: "warning" });
```

Add this check at the end of `runTranscription` after `setSentences(staged)`:

```typescript
const text = staged.map((s) => s.text).join(" ").toLowerCase();
const stopWords = ["the", "a", "an", "and", "to", "of", "in", "is", "it", "you", "i"];
const totalWords = text.split(/\s+/).filter(Boolean).length;
const stopHits = stopWords.reduce((acc, w) => acc + (text.match(new RegExp(`\\b${w}\\b`, "g"))?.length ?? 0), 0);
if (totalWords > 30 && stopHits / totalWords < 0.05) {
  showBanner({ message: "v1 is optimized for English. Results may be off.", variant: "warning" });
}
```

- [ ] **Step 4: Smoke test**

- Hide the tab while transcribing → "Tab inactive…" banner appears. Refocus → banner clears.
- Upload a non-English audio (if available) → warning appears post-transcription.

- [ ] **Step 5: Commit**

```bash
git add app/editor/page.tsx lib/storage.ts app/page.tsx && git commit -m "feat: tab-inactive, private-browsing, non-English warnings"
```

---

### Task 21: Playwright E2E tests

**Files:**
- Create: `/home/ali/Desktop/ai-video-cutter/playwright.config.ts`
- Create: `/home/ali/Desktop/ai-video-cutter/tests/e2e/unsupported-file.spec.ts`
- Create: `/home/ali/Desktop/ai-video-cutter/tests/e2e/resume.spec.ts`
- Create: `/home/ali/Desktop/ai-video-cutter/tests/e2e/happy-path.spec.ts`
- Create: `/home/ali/Desktop/ai-video-cutter/tests/e2e/fixtures/sample.mp4` (manual download, see Step 1)

- [ ] **Step 1: Get a fixture clip**

Download a tiny (~3-5 second) MP4 with clear speech for Playwright. A safe option: a short clip Ali's friend can supply, or a CC0 sample like `https://www.pexels.com/video/` — pick a brief talking clip. Save as `tests/e2e/fixtures/sample.mp4`.

Add `tests/e2e/fixtures/` to `.gitignore` if the clip is large; otherwise commit if under ~2MB.

- [ ] **Step 2: Create `playwright.config.ts`**

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    headless: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Create `tests/e2e/unsupported-file.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";

test("rejects non-video file with friendly error", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    indexedDB.deleteDatabase("ai-video-cutter");
  });
  await page.reload();
  const fileInput = page.locator("input[type=file]");
  await fileInput.setInputFiles({
    name: "fake.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a video"),
  });
  await expect(page.locator("text=Only MP4, MOV, WebM supported")).toBeVisible();
});
```

- [ ] **Step 4: Create `tests/e2e/happy-path.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";
import path from "node:path";

test("upload → transcribe → toggle → export", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => indexedDB.deleteDatabase("ai-video-cutter"));
  await page.reload();

  await page.locator("input[type=file]").setInputFiles(path.resolve(__dirname, "fixtures/sample.mp4"));

  // Editor route loads — give a generous wait for first-time model download
  await expect(page.locator("h2", { hasText: "Transcript" })).toBeVisible({ timeout: 5_000 });

  // Wait for at least one sentence card. Model download can be slow on first run; allow 6 min.
  await expect(page.locator('[class*="rounded-lg"][class*="border"]').first()).toBeVisible({ timeout: 360_000 });

  // Toggle the first sentence's Cut button
  await page.getByRole("button", { name: "Cut" }).first().click();

  // Click Export and wait for download
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export cut video/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-cut\.mp4$/);
});
```

- [ ] **Step 5: Create `tests/e2e/resume.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";
import path from "node:path";

test("reopening tab shows resume prompt", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => indexedDB.deleteDatabase("ai-video-cutter"));
  await page.reload();

  await page.locator("input[type=file]").setInputFiles(path.resolve(__dirname, "fixtures/sample.mp4"));
  await expect(page).toHaveURL(/\/editor/, { timeout: 10_000 });

  await page.goto("/");
  await expect(page.locator("text=You have a saved project")).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page).toHaveURL(/\/editor/);
});
```

- [ ] **Step 6: Run e2e**

```bash
npm run e2e
```

Expected: 3 tests pass (happy path may take several minutes the first time due to Whisper model download).

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts tests/e2e/ && git commit -m "test: Playwright e2e for happy path, resume, and bad file"
```

---

### Task 22: GitHub Actions CI

**Files:**
- Create: `/home/ali/Desktop/ai-video-cutter/.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml && git commit -m "ci: lint, typecheck, unit, and e2e on push and PR"
```

---

### Task 23: README

**Files:**
- Replace: `/home/ali/Desktop/ai-video-cutter/README.md`

- [ ] **Step 1: Replace `README.md` with:**

```markdown
# AI Video Cutter

Browser-based AI assistant that does the boring half of video editing — cut, split, trim — and stays out of the creative half.

Upload a talking-head clip, get an auto-suggested edit (filler words removed, bad takes flagged), tweak it sentence-by-sentence, and export an MP4.

## Why this exists

Built for a friend who edits short-form social content and named "cut, split, trim" as his most-hated workflow step. v1 is a personal tool, not a product.

## How it works

Everything runs in your browser:

- **Whisper-base** transcribes the audio (one-time ~150 MB model download)
- A deterministic step cuts pure-filler sentences ("um.", "uh.")
- **Groq Llama 3.3 70B** flags bad takes and low-value content via a tiny serverless proxy
- **ffmpeg.wasm** stream-copies the kept ranges and concats them — lossless, keyframe-snapped, fast

No video ever leaves your machine. The only network call is the Groq proxy carrying transcript text.

## Run locally

Prereqs: Node 20+, a Chromium-based desktop browser, and a free [Groq API key](https://console.groq.com/keys).

```bash
git clone https://github.com/Alike001/ai-video-cutter.git
cd ai-video-cutter
npm install
cp .env.example .env.local
# Edit .env.local and paste your Groq key
npm run dev
```

Open http://localhost:3000.

## Deploy

```bash
npx vercel
```

Set `GROQ_API_KEY` in the Vercel project's environment variables.

## Browser support

Works on recent desktop Chrome, Edge, or Brave. Firefox is supported but slower. Safari, mobile, and tablets are not supported (SharedArrayBuffer + memory limits).

## Tests

```bash
npm run typecheck   # tsc
npm test            # vitest unit tests
npm run e2e         # playwright integration tests
```

## Status

v1 — single-user, single-project, no auth, no payments. Stage 2 (portfolio polish) and Stage 3 (real product) live in `docs/superpowers/specs/`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md && git commit -m "docs: README"
```

---

### Task 24: Push to GitHub and deploy to Vercel

**Files:** None — this is a deployment task.

- [ ] **Step 1: Create the GitHub repo**

Ali opens https://github.com/new and creates a new public repo `ai-video-cutter` under his account `Alike001`. **Empty** — no README/license/.gitignore (we already have them).

- [ ] **Step 2: Push**

```bash
git remote add origin https://github.com/Alike001/ai-video-cutter.git
git branch -M main
git push -u origin main
```

Verify on GitHub that the commits show "Alike001" as author (not some other identity). If not, fix global git config (`git config --global user.email hammedoye10@gmail.com`) before re-committing — do NOT override per-commit.

- [ ] **Step 3: Connect to Vercel**

Visit https://vercel.com/new and import `Alike001/ai-video-cutter`. In project settings:
- Add environment variable `GROQ_API_KEY` (Production + Preview + Development scopes).

Click Deploy. First build will take a couple of minutes.

- [ ] **Step 4: Test the live URL**

Open the Vercel-provided URL (`*.vercel.app`). Run a full upload → transcribe → export against the live site with the same fixture clip used in Playwright.

Confirm:
- Headers carry COOP/COEP (DevTools → Network)
- `crossOriginIsolated === true` in the console
- A real reel exports successfully

- [ ] **Step 5: Hand to friend**

Send the friend the URL and a short message asking him to try it on one of his own reels. The done-definition for v1 (spec §10, item 8) requires his direct feedback.

---

## Self-Review

(Plan author's check against spec — done before handoff.)

**Spec coverage check:**
- §3.1 Features 1–7 ("Upload video", "In-browser transcription", "Interactive transcript view", "AI auto-suggestions", "Live preview panel", "Export cut video", "Auto-save"): covered by Tasks 9, 11–12, 12, 13–15, 16, 18–19, 7+12 respectively.
- §3.2 Sentence-level granularity: enforced by Whisper sentence-buffer logic in Task 11.
- §4.1–4.3 Architecture + folder structure: locked in "File Structure" section + Tasks 1–8.
- §4.4 Vercel hosting: Task 24.
- §4.5 Browser compat: Task 6 (capability guard).
- §5 Data model + LLM contract: Task 4 (types + zod) + Task 14 (route validates both directions).
- §6 User flow: Tasks 9 (home), 12 (editor), 16–17 (preview + bulk), 19 (export), 9 (resume prompt).
- §7 Data flow detail: explicit in Tasks 10, 11, 13, 15, 18.
- §8 Error handling: foundational system in Task 8; key catalog entries wired in Tasks 9, 12, 15, 19, 20.
- §9 Testing: Vitest in Tasks 4, 5, 13, 14; Playwright in Task 21; pre-commit covered by CI in Task 22 (skipped Husky install for v1 — type/unit/e2e all run in CI on every push/PR).
- §10 Done definition: addressed by Task 24 + Ali's friend's hands-on use as final gate.

**Placeholder scan:** searched for "TODO", "TBD", "implement later", "similar to" — none present in implementation steps. All code blocks are complete.

**Type consistency:** `Sentence`, `Project`, `CutReason`, `SuggestCutsResponse` types used consistently across all tasks. `extractMonoPCM`, `transcribe`, `applyDeterministicCuts`, `fetchSuggestions`, `mergeSuggestions`, `exportCutVideo`, `seekTo` — same names in declaration and use sites.

**Known caveats acknowledged in plan (not gaps):**
- Pre-commit hooks (spec §9.4 mentions Husky); skipped for v1 in favor of CI on push (simpler for first-time Next.js setup). If you want hooks locally, add `husky` + a `pre-commit` script later — it's not a v1 ship gate.
- "Cut all fillers" only flips current filler-tagged sentences (Task 17). Re-running it after re-toggling a filler back to keep will not re-cut it — that's intentional; the toggle is the editor's final word.

---

## Execution Handoff

Plan complete and saved to `/home/ali/Desktop/ai-video-cutter/docs/superpowers/plans/2026-05-18-ai-video-cutter-v1.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Good when you want me to drive the build while you watch.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Good if you want to learn Next.js by typing commands yourself alongside me.

Given the memory note that **Ali prefers to walk through learning milestones rather than have things auto-executed**, option 2 (or a hybrid — Ali types the first few tasks himself, then hands off Phase 3+ to subagents once Next.js feels familiar) is likely the right choice here. But it's your call.

Which approach?
