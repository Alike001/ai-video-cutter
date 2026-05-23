# AI Video Cutter

Browser-based AI assistant that does the boring half of video editing — cut, split, trim — and stays out of the creative half.

Upload a talking-head clip, get an auto-suggested edit (filler words removed, bad takes flagged), tweak it sentence-by-sentence, and export an MP4.

## Why this exists

Built for a friend who edits short-form social content and named "cut, split, trim" as his most-hated workflow step. v1 is a personal tool, not a product.

## How it works

Everything heavy runs in your browser; the only network call is a thin Groq proxy carrying transcript text:

- **Groq Whisper (large-v3-turbo)** transcribes the audio via the `/api/transcribe` proxy
- A deterministic step cuts pure-filler sentences ("um.", "uh.")
- **Groq Llama 3.3 70B** flags bad takes and low-value content via `/api/suggest-cuts`
- **ffmpeg.wasm** stream-copies the kept ranges and concats them in the browser — lossless, keyframe-snapped, fast

Your video bytes never leave your machine. Only the extracted audio (for transcription) and the transcript text (for suggestion) are sent to Groq.

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
