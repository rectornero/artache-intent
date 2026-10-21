// Draft -> Script with Claude, on the writer's own API key. The key lives in
// this device's app storage only: never in project files, never in exports.
// Any failure falls back to the plain rules, so the tabs always convert.

import spec from "../docs/SPEC.md?raw";
import type { ProjectConfig } from "../src/core/config.ts";
import type { Sheet } from "../src/core/sheets.ts";

const KEY = "artache-intent.anthropic-key";
const MODEL_KEY = "artache-intent.claude-model";

export const CLAUDE_MODELS = [
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", note: "Balanced: fast and affordable" },
  { id: "claude-opus-5-5", label: "Opus 5.5", note: "Most careful, costs more" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5", note: "Fastest and cheapest" },
] as const;
export type ClaudeModel = (typeof CLAUDE_MODELS)[number]["id"];

export function loadModel(): ClaudeModel {
  try {
    const m = localStorage.getItem(MODEL_KEY);
    if (CLAUDE_MODELS.some((x) => x.id === m)) return m as ClaudeModel;
  } catch {
    // Storage blocked: use the default.
  }
  return "claude-sonnet-5-5";
}

export function saveModel(m: ClaudeModel) {
  try {
    localStorage.setItem(MODEL_KEY, m);
  } catch {
    // Storage blocked: the choice lasts for this session only.
  }
}

export function loadApiKey(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveApiKey(key: string) {
  try {
    if (key.trim()) localStorage.setItem(KEY, key.trim());
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the key just isn't remembered.
  }
}

const SYSTEM = `You convert a writer's prose drafts into Intent Script, the plain-text format below.

Rules:
- Never change, add or drop the writer's words. Spoken words go into dialogue lines exactly as written; narration stays narration.
- Each passage is converted on its own and returned in the same order.
- Speech tags ("she says", "Edward agrees", "Tony mutters, pocketing the keys") name the speaker; drop pure tags, keep any action in them as narration.
- Use the cast keys given (ALL CAPS) for speakers. Work out who "he", "she" or "they" is from each character's gender, their nicknames and the story so far. A speaker you cannot identify for sure: pick the likeliest and add a line "// check: <why>" just above.
- When the scene moves to a place that has a background, add [BG Name] (plus a tint if the prose gives a time of day) and its [MUSIC ...] if the place sheet has one.
- When the prose triggers a minigame ("an Investigation minigame starts"), keep the sentence as narration if it reads as story, and add ">> MINIGAME: Name" after it.
- Plain lines are spoken by the current narrator; don't prefix them.
- Use "// check:" notes only for real doubts. No other commentary.

Intent Script reference:

${spec}`;

const FORMAT = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    properties: {
      passages: {
        type: "array",
        items: { type: "object", properties: { script: { type: "string" } }, required: ["script"], additionalProperties: false },
      },
    },
    required: ["passages"],
    additionalProperties: false,
  },
};

function context(cfg: ProjectConfig, sheets: Sheet[], before: string): string {
  const cast = Object.entries(cfg.cast)
    .map(([k, m]) => `${k}${m.display && m.display !== k ? ` (${m.display})` : ""}${m.aliases?.length ? `, also ${m.aliases.join(", ")}` : ""}`)
    .join("\n");
  const sheetText = sheets
    .map((s) => [`@${s.kind} ${s.name}`, ...Object.entries(s.fields).filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v.replace(/\n/g, " ")}`)].join("\n"))
    .join("\n\n");
  return [
    `Narrator: ${cfg.narrator ?? "none (plain narration)"}`,
    `Cast:\n${cast || "(none yet)"}`,
    `Backgrounds: ${Object.keys(cfg.assets.bg).join(", ") || "(none)"}`,
    `Music: ${Object.keys(cfg.assets.music).join(", ") || "(none)"}`,
    `Sheets:\n${sheetText || "(none)"}`,
    `The script so far (for context only):\n${before.split("\n").slice(-40).join("\n")}`,
  ].join("\n\n");
}

// Passages Claude already converted this session: the same prose never costs a second call.
const done = new Map<string, string>();
export const remembered = (prose: string) => done.get(prose.trim());

/** One script per passage, in order. Throws on any failure; the caller falls back to rules. */
export async function claudeConvert(apiKey: string, model: ClaudeModel, passages: string[], cfg: ProjectConfig, sheets: Sheet[], before: string): Promise<string[]> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const body = passages.map((p, i) => `<passage n="${i + 1}">\n${p}\n</passage>`).join("\n\n");
  const message = await client.beta.messages
    .stream({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: FORMAT },
      system: SYSTEM,
      messages: [{ role: "user", content: `${context(cfg, sheets, before)}\n\nConvert these ${passages.length} passage(s):\n\n${body}` }],
    })
    .finalMessage();
  if (message.stop_reason === "refusal") throw new Error("Claude declined this passage");
  if (message.stop_reason === "max_tokens") throw new Error("the passages were too long for one go");
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const out = (JSON.parse(text) as { passages: Array<{ script: string }> }).passages.map((p) => p.script.trim());
  if (out.length !== passages.length) throw new Error(`got ${out.length} passages back, expected ${passages.length}`);
  passages.forEach((p, i) => done.set(p.trim(), out[i]));
  return out;
}

/** A failure in words a writer can act on. */
export function explainFailure(e: unknown): string {
  const status = (e as { status?: number })?.status;
  if (status === 401) return "the API key was refused; check it in Settings";
  if (status === 429) return "too many requests right now; try again in a minute";
  if (status === 529 || (status ?? 0) >= 500) return "Claude is busy right now";
  if (e instanceof TypeError) return "no connection";
  return (e instanceof Error ? e.message : String(e)).slice(0, 80);
}
