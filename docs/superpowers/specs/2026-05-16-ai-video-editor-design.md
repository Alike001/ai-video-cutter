# AI Video Cutter — v1 Design Spec

**Date:** 2026-05-16
**Author:** Hammed Ali Oyeleye (designed with Claude)
**Status:** Draft — pending review
**Working project name:** `ai-video-cutter` (placeholder; can be renamed anytime)

---

## 1. Project context

### 1.1 The user

Ali's friend — a creative, detail-oriented video editor specialized in short-form social content (Instagram Reels, TikTok-style, X/Telegram). He produces motivational, lifestyle, entertainment, and viral-style content, plus real estate marketing video for Omkable Homes & Properties and educational shorts for AFEC Educational Consult.

He shoots at 4K and edits **primarily on a laptop**. His content is largely talking-head + voiceover with some B-roll. He ships 5–15 short videos per week.

### 1.2 The pain

When asked directly what part of editing he hates the most, his answer was: **"cut, split and trim."** These are the most repetitive, mechanical operations in his workflow.

He also mentioned wanting help **finding sound or music** — acknowledged as a real pain point, but deferred to v2 (different product surface).

### 1.3 The goal

Build a free, browser-based AI assistant that handles the mechanical cut/split/trim work — auto-suggesting cuts for filler words, silences, and bad takes — while keeping the editor in full control of every decision.

### 1.4 The non-goal

NOT to replace the editor. NOT to do creative work for him. NOT to handle music sourcing, B-roll mining, transitions, effects, color grading, multi-cam sync, or anything beyond cut/split/trim.

### 1.5 Staging

This spec defines v1 of **Stage 1** of a 3-stage roadmap:

- **Stage 1 (this spec):** Personal tool, single user, no auth, hosted on Vercel free tier. ~2–3 weeks to ship.
- **Stage 2:** Polish into portfolio piece — public-facing landing, demo video, README. ~4–6 weeks total.
- **Stage 3:** Real product — multi-user, auth, free + paid tiers. Only pursue if Stages 1 and 2 prove demand. Months of work.

Stages 2 and 3 are out of scope for this spec.

---

## 2. Success criteria

v1 ships successfully when:

1. Ali's friend uploads one of his real talking-head reels, uses the tool end-to-end, and the exported video is good enough that he would have published it.
2. The process is faster than his current manual workflow.
3. The tool runs at **$0/month ongoing cost**.
4. Hosted at a working public Vercel URL.

---

## 3. Feature scope

### 3.1 In scope (v1)

| # | Feature | Description |
|---|---|---|
| 1 | Upload video | Drag-and-drop or file picker. Single MP4/MOV/WebM file. ≤15 min recommended. |
| 2 | In-browser transcription | `@xenova/transformers` Whisper-base. Sentence-level output with timestamps. |
| 3 | Interactive transcript view | Clickable sentence cards. Click → play in preview. Toggle keep/cut per sentence. |
| 4 | AI auto-suggestions | Deterministic detection of pauses + pure-filler sentences (client-side). LLM detection of bad takes + low-value content (Groq Llama 3.3 70B via server proxy). Suggestions pre-applied; editor overrides freely. |
| 5 | Live preview panel | HTML5 `<video>`. Two modes: "Play kept only" (default), "Play original". |
| 6 | Export cut video | `@ffmpeg/ffmpeg` stream-copy mode. Lossless, fast, keyframe-snapped. MP4 download. |
| 7 | Auto-save project state | IndexedDB. Debounced 500ms writes. Resume prompt on tab reopen. |

### 3.2 Cut granularity

**Sentence-level only.** No word-level cuts in v1. Whisper's sentence segmentation drives cut boundaries. Trade-off: cannot remove a single "um" from the middle of a sentence; would cut the whole sentence. Acceptable for v1; revisit in v1.1 if friend's usage proves it's a real pain.

### 3.3 Out of scope (v1)

- Word-level granularity (v1.1 if needed)
- Music / sound discovery (deferred to v2)
- B-roll / beat-synced cutting (deferred to v2)
- Burned-in captions (Stage 2)
- Multi-project / project library (one active project at a time)
- Cloud storage of videos (everything stays in browser)
- Multi-user / auth / accounts (Stage 3)
- Payments / subscriptions (Stage 3)
- Music, transitions, effects, color grading, multi-cam (different products)
- Frame-perfect cuts (Stage 2 — adds "Precise Export" toggle with full re-encode)
- Audio normalization, leveling
- Non-English audio (warned but not blocked)
- Mobile / tablet support (architecturally unsuitable; see §11)
- Collaboration / sharing
- Long videos (>15 min — soft limit, may fail)

---

## 4. Architecture

### 4.1 System overview

All heavy compute runs in the user's browser. The Vercel server hosts the Next.js app and a single API route that proxies LLM calls.

```
BROWSER (user's machine)                             VERCEL (free tier)
─────────────────────────────────────────            ─────────────────────────
Next.js client (React)                               Next.js static + edge
  ├─ Upload page                                       ├─ Static assets
  ├─ Editor page                                       └─ /api/suggest-cuts
  ├─ transformers.js (Whisper-base)                       (Route Handler;
  ├─ HTML5 video preview                                   holds GROQ_API_KEY;
  ├─ ffmpeg.wasm (stream-copy)                             proxies to Groq)
  └─ IndexedDB (project persistence)
              │
              └── POST /api/suggest-cuts ──────────────►  Groq API
                                                            (Llama 3.3 70B)
```

### 4.2 Tech stack

| Package | Purpose |
|---|---|
| `next` (15.x) | Framework, App Router |
| `react` + `react-dom` (18.x) | UI |
| `typescript` (5.x) | Type safety |
| `tailwindcss` (3.x) | Styling |
| `@xenova/transformers` | In-browser Whisper |
| `@ffmpeg/ffmpeg` + `@ffmpeg/util` | Browser video cutting |
| `idb` | IndexedDB wrapper |
| `zod` | Runtime validation |
| `lucide-react` | Icons |
| `vitest` | Unit tests |
| `@playwright/test` | Integration tests |

No backend database. No auth library. No payment SDK. No Redis. No queue. No cron.

### 4.3 Folder structure

```
ai-video-cutter/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # Home / upload
│   ├── editor/page.tsx             # Editor view
│   └── api/suggest-cuts/route.ts   # Groq proxy
├── components/
│   ├── upload-dropzone.tsx
│   ├── transcript-view.tsx
│   ├── video-preview.tsx
│   ├── cut-controls.tsx
│   ├── export-button.tsx
│   └── progress-bar.tsx
├── lib/
│   ├── whisper.ts                  # transformers.js wrapper
│   ├── ffmpeg.ts                   # ffmpeg.wasm wrapper
│   ├── storage.ts                  # IndexedDB wrapper
│   ├── groq-client.ts              # /api/suggest-cuts fetch wrapper
│   ├── cut-detector.ts             # Deterministic pause/filler detection
│   ├── error-banner.tsx            # Unified error UI
│   ├── types.ts
│   └── utils.ts
├── tests/
│   ├── unit/                       # Vitest
│   └── e2e/                        # Playwright
├── public/
├── .env.local                      # GROQ_API_KEY (gitignored)
├── .env.example
├── next.config.ts                  # COOP/COEP headers for WASM
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

### 4.4 Hosting

Vercel free tier. Auto-deploy from `main` branch of GitHub repo. No additional infrastructure.

### 4.5 Browser compatibility

| Browser | Status |
|---|---|
| Chrome (desktop) | ✅ Recommended |
| Edge (desktop) | ✅ Recommended |
| Brave (desktop) | ✅ Recommended |
| Firefox (desktop) | ⚠️ Supported but may be slow |
| Safari (desktop) | ❌ Unsupported (SharedArrayBuffer issues) |
| Mobile browsers | ❌ Unsupported (memory / perf limits) |

Boundary check on page load: if required APIs (`SharedArrayBuffer`, `WebAssembly`, `IndexedDB`, `AudioContext`, `File`) are missing, show "use a different browser" page.

---

## 5. Data model

### 5.1 Core types (`lib/types.ts`)

```typescript
export type CutReason = 'filler' | 'pause' | 'bad_take' | 'low_value'

export type Sentence = {
  id: string                    // generated uuid
  text: string
  startSec: number
  endSec: number
  keep: boolean                 // editor's final decision
  suggestedKeep: boolean        // AI/deterministic recommendation
  reason?: CutReason            // why suggested to cut
}

export type Project = {
  videoBlob: Blob
  videoFileName: string
  videoMimeType: string
  durationSec: number
  sentences: Sentence[]
  createdAt: number
  lastModifiedAt: number
}
```

### 5.2 IndexedDB store

- Database name: `ai-video-cutter`
- Store name: `projects`
- Key: `'current'` (single project at a time)
- Value shape: `Project`

### 5.3 LLM API contract (`POST /api/suggest-cuts`)

**Request:**
```json
{
  "sentences": [
    { "id": "s1", "text": "Hey everyone.", "startSec": 0, "endSec": 1.2 }
  ]
}
```

**Response (200):**
```json
{
  "suggestions": [
    { "id": "s1", "suggestedKeep": true,  "reason": null },
    { "id": "s2", "suggestedKeep": false, "reason": "bad_take" }
  ]
}
```

**Response (4xx/5xx):** Standard JSON error `{ "error": "message" }`. Client falls back to no-AI mode (deterministic suggestions still apply).

Server uses Groq's JSON mode with Llama 3.3 70B. Server validates response with zod before returning.

---

## 6. User flow

### 6.1 Home → upload (`/`)

- Drag-and-drop or file picker
- On valid file: read into Blob, extract `durationSec` via temporary `<video>` element, save initial `Project` to IndexedDB, navigate to `/editor`
- If IndexedDB has an existing project, show "Resume last project?" prompt with "Start new" option

### 6.2 Editor (`/editor`)

Three panels:
- **Left:** scrollable transcript with clickable sentence cards
- **Top right:** HTML5 video preview
- **Bottom right:** stats (original/cut duration, savings %) + bulk actions + export button

Sequential progress states on first entry:
1. Loading Whisper model (first visit only; cached after)
2. Transcribing audio
3. Analyzing cuts (deterministic + LLM)
4. Ready to edit

Per-sentence card:
- Timestamp range (e.g., `0:12–0:18`)
- Text
- Keep/Cut toggle (default = AI suggestion)
- Reason badge if cut suggested (`filler`, `pause`, `bad take`, `low value`)
- Cut sentences shown struck-through and gray

### 6.3 Preview playback

- **Default mode "Play kept only":** plays only kept sentences in sequence using `currentTime` jumps via `timeupdate` listener
- **Toggle "Play original":** plays full source video uncut for verification

### 6.4 Bulk actions

- *Accept all AI* — keep AI suggestions as-is
- *Reject all AI* — flip everything back to keep
- *Cut all fillers* — apply only filler cuts, leave pauses/bad-takes alone

### 6.5 Export

- Disabled if zero sentences kept (tooltip: "Keep at least one sentence first")
- On click: build kept time ranges, merge contiguous, run ffmpeg.wasm stream-copy + concat
- Success state: "Done" + auto-download + buttons for "Edit again" / "New project"

### 6.6 Resume

- Returning to URL with saved project → "Resume last project" prompt
- "New project" wipes saved project from IndexedDB after a confirmation

---

## 7. Data flow detail

### 7.1 Upload to transcript

1. File → Blob in React state + IndexedDB (atomic write)
2. Web Audio API: `decodeAudioData` → `Float32Array` PCM at 16kHz, mono
3. `@xenova/transformers` Whisper-base pipeline → sentence chunks with `{ text, timestamp: [start, end] }`
4. Map to `Sentence[]` with `keep: true, suggestedKeep: true` defaults, generated UUIDs
5. Save full transcript to IndexedDB (atomic write)

### 7.2 AI suggestions — two-stage hybrid

**Stage A — Deterministic (client-side, no LLM):**

- **Pause detection:** if gap between consecutive sentences > 1.5s, mark the gap as cuttable
- **Pure-filler detection:** regex match `/^(um|uh|like|you know|so|ah|hmm)[\s,.!?]*$/i` → mark sentence with `suggestedKeep: false, reason: 'filler'`

**Stage B — LLM (server-side proxy):**

- Send only sentences not already cut by Stage A (efficiency)
- Groq Llama 3.3 70B with JSON mode
- Prompt asks only for `bad_take` and `low_value` classifications (Stage A handled filler/pause)
- Server validates response with zod before returning
- Client merges suggestions into local `Sentence[]`

### 7.3 Editor interactions

- React `useState` (or `useReducer`) for sentences array
- Every toggle: update local state, debounce-write to IndexedDB (500ms)
- Preview jump: on sentence click, `videoRef.current.currentTime = sentence.startSec`
- "Play kept only" mode: `timeupdate` listener checks if current playhead is in a cut sentence, jumps to next kept sentence's `startSec`

### 7.4 Export

1. Filter `sentences.filter(s => s.keep)` → build `[startSec, endSec]` ranges, merge contiguous
2. Lazy-import `@ffmpeg/ffmpeg`, instantiate
3. Write video blob to ffmpeg.wasm virtual FS
4. For each range: `ffmpeg -ss <start> -to <end> -i input.mp4 -c copy clip_N.mp4`
5. Concat: `ffmpeg -f concat -safe 0 -i list.txt -c copy output.mp4`
6. Read `output.mp4` from virtual FS, create Blob URL, trigger download as `output.mp4`

---

## 8. Error handling

### 8.1 Principles

1. Every error gives the user a next step
2. Graceful degradation over hard failure
3. No fake recovery (don't pretend things work when they don't)

### 8.2 Implementation pattern

All async errors funnel through a single `useErrorBanner()` hook. One banner active at a time. Latest message wins.

```typescript
type BannerVariant = 'info' | 'warning' | 'error'
type BannerState = {
  message: string
  variant: BannerVariant
  actionLabel?: string
  onAction?: () => void
} | null
```

### 8.3 Failure catalog (key cases)

| Phase | Failure | User-facing message + next step |
|---|---|---|
| Upload | Wrong file type | "Only MP4, MOV, WebM supported. Convert with HandBrake or CloudConvert." |
| Upload | File > 2GB | "This file is huge ({size}GB). Try a shorter clip or lower resolution." |
| Upload | Corrupted file | "Couldn't read this file. Try re-exporting from your editor." |
| Transcribe | Model download fails | "Couldn't download AI model. Check internet." + Retry |
| Transcribe | Audio decode fails | "Couldn't read audio. Usually unsupported codec — try re-encoding." |
| Transcribe | Empty transcript | "No speech detected. Pick a video with talking." |
| Transcribe | Crashes mid-run | "Transcription failed — usually memory on long videos. Try <10 min." |
| Transcribe | Non-English | (Banner, non-blocking) "v1 is optimized for English. Results may be off." |
| AI suggest | Network timeout | Non-blocking banner; retry once after 5s; if still fail: "Smart AI suggestions unavailable — basic filler/pause detection still active." |
| AI suggest | Rate limit (429) | Same as above |
| AI suggest | Bad JSON / wrong schema | Degrade silently; banner: "Smart AI suggestions unavailable — basic filler/pause detection still active." |
| Editor | No sentences kept | Export button disabled with tooltip |
| Editor | Tab loses focus | Banner: "Tab inactive — bring it back to keep transcribing." |
| Export | FFmpeg OOM | "Export ran out of memory. Try fewer cuts or shorter video." |
| Export | FFmpeg crashes | "Export failed." + Retry |
| Export | Stream-copy fails | "Encoding issue. Try re-exporting from your camera as standard MP4." |
| Persist | IndexedDB blocked | Banner: "Private browsing — work won't save if you close tab." |
| Persist | Quota exceeded | "Out of browser storage. Clear last project or use shorter video." |

### 8.4 Persistence guarantees

| State | Survives error / restart? |
|---|---|
| Uploaded video blob | ✅ After upload completes |
| Full transcript | ✅ After transcription completes (atomic write) |
| AI suggestions | ✅ After successful merge into sentences |
| Every edit decision | ✅ Debounced 500ms write on every change |
| Mid-transcription progress | ❌ v1 does not save partial transcripts. Mid-transcription failure → re-run transcription on same video (no re-upload). |

If mid-transcription failure becomes a recurring annoyance in real use, v1.1 enhancement: chunk audio into 30s segments and save partial transcripts incrementally (~50 lines of code).

### 8.5 What v1 deliberately does NOT do

- No remote error logging (no Sentry)
- No infinite retry loops (at most one retry per call)
- No automatic bug reports
- No error-toast spam (one banner max)

---

## 9. Testing strategy

### 9.1 Layer 1 — Real-footage manual testing (highest value)

Test on 5–10 representative videos from Ali's friend covering all his content types:
- 1–2 motivational/lifestyle reels with voiceover
- 1–2 real estate walkthrough clips
- 1–2 educational shorts
- 1 long-form (~10 min) to test edge cases

Full flow each: upload → transcribe → AI suggest → edit → export. Watch exported output for cut accuracy. **His friend personally uses it for at least one real reel before v1 is declared done.**

### 9.2 Layer 2 — Unit tests (Vitest)

Only pure, deterministic, non-DOM logic:

| File | What's tested |
|---|---|
| `lib/utils.ts` | Time formatting, range merging |
| `lib/types.ts` (zod schemas) | LLM response validation |
| `lib/cut-detector.ts` | Filler regex + pause detection |
| `app/api/suggest-cuts/route.ts` | Request validation, error mapping (Groq mocked) |

Not tested: React components, Whisper, FFmpeg, IndexedDB internals (their respective libraries handle that).

### 9.3 Layer 3 — Integration tests (Playwright, light)

~3 tests covering the critical path:
1. Upload → transcript appears → toggle a sentence → export → file downloads
2. Reopen tab → "Resume" prompt appears → state restored
3. Upload unsupported file → friendly error → can try another

Run on every push to `main` via GitHub Actions.

### 9.4 Pre-commit hooks

- `tsc --noEmit` (type check)
- ESLint + Prettier
- Vitest unit tests

### 9.5 Skipped for v1

Visual regression, perf benchmarks, cross-browser matrix, mobile, load tests, security audit, accessibility audit. All deferred to Stage 2 or later.

---

## 10. Done definition for v1

v1 is done when **all** of these are true:

1. Deployed to Vercel at a working public URL
2. Ali's friend has uploaded one real reel and successfully exported a cut version
3. All 3 Playwright integration tests pass
4. All Vitest unit tests pass
5. Type check passes (`tsc --noEmit`)
6. No console errors on the happy path
7. README explains how to run locally + deploy
8. Friend has given direct feedback on whether v1 is useful

---

## 11. Non-goals & explicit deferrals (consolidated)

| Item | Deferred to | Reason |
|---|---|---|
| Music / sound discovery | v2 | Different product surface; friend explicitly requested but treated as separate feature |
| B-roll / beat-synced cutting | v2 | Different tech stack (visual + beat vs transcript) |
| Word-level granularity | v1.1 if needed | Sentence-level handles 95% of cuts |
| Burned-in captions | Stage 2 | Different product concern |
| Frame-perfect cuts | Stage 2 | Add "Precise Export" toggle with full re-encode |
| Mobile / tablet support | Stage 3 + | Architecturally unsuitable for browser-only $0 model; would require server-side compute |
| Multi-user / auth / billing | Stage 3 | Requires sustained users + revenue first |
| Cloud sync / sharing | Stage 3 | Same |
| Long videos (>15 min) | Open | Soft limit, may work, not tested |

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Whisper accuracy on Nigerian English accents | Test early with friend's real footage; upgrade to Whisper-small (250MB) if accuracy is poor |
| First-load model download is ~150MB | Show clear progress UI; cache via service worker / browser cache |
| Browser memory limits with 4K video | Stream-copy avoids re-encoding, so memory footprint stays low |
| Groq free tier rate limits (30 RPM) | Not a v1 problem (single user); add backoff/queue if Stage 3 |
| IndexedDB quota | Single project at a time; warn user on very large files |
| Stream-copy keyframe-snap precision (~1-5s) | Acceptable for sentence-level v1; document; add precise-mode in Stage 2 |
| LLM hallucinates IDs or wrong schema | Server-side zod validation; client drops unknown IDs; degrade if validation fails |
| Friend doesn't actually use it | Mitigated by involving him in scope (he named "cut, split, trim"); v1 done-definition requires his real usage |

---

## 13. Open questions

None at spec-write time. All major design decisions resolved during brainstorming. Any new questions discovered during implementation will be tracked in the implementation plan (separate document).

---

**End of spec.**
