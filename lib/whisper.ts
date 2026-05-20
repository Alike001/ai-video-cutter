import { uuid } from "@/lib/utils";
import type { Sentence } from "@/lib/types";

const SAMPLE_RATE = 16000;

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function pcmToWav(pcm: Float32Array, sampleRate = SAMPLE_RATE): Blob {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    const sample = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export function preloadModel(_onProgress?: (frac: number) => void): void {
  // No-op: Groq handles the model server-side. Kept for API compatibility.
}

type GroqSegment = {
  start: number;
  end: number;
  text: string;
};

type GroqResponse = {
  segments?: GroqSegment[];
  language?: string;
  text?: string;
};

export async function transcribe(
  pcm: Float32Array,
  _opts: { onModelProgress?: (frac: number) => void } = {}
): Promise<Sentence[]> {
  const wav = pcmToWav(pcm);
  const form = new FormData();
  form.append("file", wav, "audio.wav");

  const response = await fetch("/api/transcribe", {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Transcription request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as GroqResponse;
  const segments = data.segments ?? [];

  return segments
    .map((seg) => ({
      id: uuid(),
      text: seg.text.trim(),
      startSec: seg.start,
      endSec: seg.end,
      keep: true,
      suggestedKeep: true,
    }))
    .filter((s) => s.text.length > 0);
}
