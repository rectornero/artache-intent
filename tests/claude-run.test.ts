import { beforeEach, describe, expect, it, vi } from "vitest";
import { explainFailure, runJob, type Job } from "../app/claude.ts";

// runJob talks to the Anthropic SDK; these tests stand in for it and check what
// Intent sends and how it reads (or refuses) the answer.
const sdk = vi.hoisted(() => ({ calls: [] as Array<{ apiKey: string; params: Record<string, unknown> }>, reply: {} as Record<string, unknown> }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    apiKey: string;
    constructor(opts: { apiKey: string }) {
      this.apiKey = opts.apiKey;
    }
    beta = {
      messages: {
        stream: (params: Record<string, unknown>) => {
          sdk.calls.push({ apiKey: this.apiKey, params });
          return { finalMessage: async () => sdk.reply };
        },
      },
    };
  },
}));


const job = (over: Partial<Job<string>> = {}): Job<string> => ({
  title: "Test",
  system: "Be brief.",
  content: "Say hi.",
  schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  effort: "low",
  maxTokens: 1000,
  thinking: false,
  read: (d) => (d as { text: string }).text,
  pasteAs: "",
  readPasted: (a) => a,
  ...over,
});
const answer = (text: string, stop = "end_turn") => (sdk.reply = { stop_reason: stop, content: [{ type: "text", text }] });

describe("runJob", () => {
  beforeEach(() => {
    sdk.calls.length = 0;
    answer(JSON.stringify({ text: "hi" }));
  });

  it("sends the job and reads the structured answer", async () => {
    expect(await runJob("sk-test", "claude-sonnet-5-5", job())).toBe("hi");
    const { apiKey, params } = sdk.calls[0];
    expect(apiKey).toBe("sk-test");
    expect(params).toMatchObject({
      model: "claude-sonnet-5-5",
      max_tokens: 1000,
      system: "Be brief.",
      messages: [{ role: "user", content: "Say hi." }],
      output_config: { effort: "low", format: { type: "json_schema", schema: job().schema } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    expect(params.thinking).toBeUndefined();
  });

  it("asks for adaptive thinking when the job wants it", async () => {
    await runJob("k", "claude-sonnet-5-5", job({ thinking: true }));
    expect(sdk.calls[0].params.thinking).toEqual({ type: "adaptive" });
  });

  it("leaves out the fallback beta for Haiku", async () => {
    await runJob("k", "claude-haiku-5-5", job());
    expect(sdk.calls[0].params.betas).toBeUndefined();
    expect(sdk.calls[0].params.fallbacks).toBeUndefined();
  });

  it("joins text blocks and skips others", async () => {
    sdk.reply = { stop_reason: "end_turn", content: [{ type: "thinking", thinking: "…" }, { type: "text", text: '{"text":' }, { type: "text", text: '"joined"}' }] };
    expect(await runJob("k", "claude-sonnet-5-5", job())).toBe("joined");
  });

  it("refuses a declined or cut-off answer instead of applying it", async () => {
    answer("{}", "refusal");
    await expect(runJob("k", "claude-sonnet-5-5", job())).rejects.toThrow("Claude declined this text");
    answer('{"text":"half', "max_tokens");
    await expect(runJob("k", "claude-sonnet-5-5", job())).rejects.toThrow("too long for one go");
  });
});

describe("explainFailure", () => {
  it("puts API errors in words a writer can act on", () => {
    expect(explainFailure({ status: 401 })).toMatch(/API key was refused/);
    expect(explainFailure({ status: 429 })).toMatch(/too many requests/);
    expect(explainFailure({ status: 529 })).toMatch(/busy/);
    expect(explainFailure({ status: 500 })).toMatch(/busy/);
    expect(explainFailure(new TypeError("fetch failed"))).toBe("no connection");
    expect(explainFailure(new Error("x".repeat(200)))).toHaveLength(80);
  });
});
