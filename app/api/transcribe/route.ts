import { NextRequest, NextResponse } from "next/server";
import { Agent } from "undici";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";
const MAX_ATTEMPTS = 3;

const ipv4Dispatcher = new Agent({
  connect: { family: 4 },
  bodyTimeout: 120_000,
  headersTimeout: 60_000,
});

async function callGroq(apiKey: string, fileBuffer: ArrayBuffer): Promise<Response> {
  const groqForm = new FormData();
  groqForm.append("file", new Blob([fileBuffer], { type: "audio/wav" }), "audio.wav");
  groqForm.append("model", GROQ_MODEL);
  groqForm.append("response_format", "verbose_json");
  groqForm.append("language", "en");
  groqForm.append("temperature", "0");

  return fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: groqForm,
    // @ts-expect-error - dispatcher is a Node/undici extension
    dispatcher: ipv4Dispatcher,
  });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  const incoming = await req.formData();
  const file = incoming.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing audio file." }, { status: 400 });
  }

  const fileBuffer = await file.arrayBuffer();

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await callGroq(apiKey, fileBuffer);
      if (!response.ok) {
        const detail = await response.text();
        if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
          lastError = new Error(`Groq ${response.status}: ${detail}`);
          await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
          continue;
        }
        return NextResponse.json(
          { error: `Groq API error (${response.status})`, detail },
          { status: response.status }
        );
      }
      const data = await response.json();
      return NextResponse.json(data);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
        continue;
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  return NextResponse.json(
    { error: `Transcription failed after ${MAX_ATTEMPTS} attempts: ${message}` },
    { status: 502 }
  );
}
