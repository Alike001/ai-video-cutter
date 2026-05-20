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
