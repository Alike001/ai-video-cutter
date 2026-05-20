import { NextResponse } from "next/server";
import { Agent } from "undici";
import {
  suggestCutsRequestSchema,
  suggestCutsResponseSchema,
} from "@/lib/types";

export const runtime = "nodejs";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const MAX_ATTEMPTS = 3;

const ipv4Dispatcher = new Agent({
  connect: { family: 4 },
  bodyTimeout: 60_000,
  headersTimeout: 30_000,
});

const SYSTEM_PROMPT = `You help a video editor remove bad takes and low-value content from a transcript.
For each sentence, decide whether to KEEP or CUT.
- CUT if the sentence is a botched take, stumbles, contradicts itself, or duplicates an earlier sentence (bad_take).
- CUT if the sentence is filler talk that doesn't move the message forward (low_value).
- Otherwise KEEP.
Do NOT cut for fillers like "um" or "uh" — those are handled separately.
Respond ONLY with JSON matching: { "suggestions": [ { "id": string, "suggestedKeep": boolean, "reason": "bad_take" | "low_value" | null } ] }.
Include every input sentence id exactly once.`;

async function callGroq(apiKey: string, userMessage: string): Promise<Response> {
  return fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
    // @ts-expect-error - dispatcher is a Node/undici extension
    dispatcher: ipv4Dispatcher,
  });
}

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
    return NextResponse.json(
      { error: "GROQ_API_KEY not configured" },
      { status: 500 }
    );
  }

  const userMessage = JSON.stringify({ sentences: parsed.data.sentences });

  let groqRes: Response | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      groqRes = await callGroq(apiKey, userMessage);
      if (!groqRes.ok && groqRes.status >= 500 && attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
        continue;
      }
      break;
    } catch {
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
        continue;
      }
      return NextResponse.json({ error: "Groq request failed" }, { status: 502 });
    }
  }

  if (!groqRes || !groqRes.ok) {
    return NextResponse.json(
      { error: `Groq error ${groqRes?.status ?? "unknown"}` },
      { status: 502 }
    );
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
