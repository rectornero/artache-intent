// Claude keeps Draft, Play and Code in step, on the writer's own API key, only
// when the writer asks. The key lives in this device's app storage only:
// never in project files, never in exports.

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

const SYSTEM = `You keep three versions of a game script in step for a writer:
- Draft: the story as prose, in the writer's own words.
- Play: the same story in Intent Script, the plain-text format described below.
- Code: the Ren'Py code for it, as Intent generates it, possibly with the writer's own tweaks.

You get the version the writer changed, before and after, and the current text of the version to update. Apply to that version exactly the changes the edit calls for, written the way that version is written, and keep everything else in it unchanged, character for character, including anything the writer edited there by hand.

Rules:
- Never reword the writer's text. Dialogue and narration carry over word for word between Draft and Play.
- Draft to Play: speech tags ("she says", "Edward agrees") name the speaker and are dropped; actions in tags stay as narration. Use the cast keys (ALL CAPS). Work out who "he", "she" or "they" is from each character's gender, nicknames and the story. Place changes add [BG Name] and the place's [MUSIC ...]; minigames add ">> MINIGAME: Name".
- Play to Draft: write new script lines as prose in the style of the surrounding draft ("“Line,” Tony says."). Stage directions become short prose only when the draft already describes such things; otherwise leave them out.
- Play to Code and back: follow how the existing code renders each kind of line.
- If the version to update is empty, write it in full from the changed version.
- Where you can't be sure, add a note line just above: "// check: why" in Play, "# check: why" in Code, "[check: why]" in Draft.

Intent Script reference:

${spec}`;

const FORMAT = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false,
  },
};

const NAMES = { draft: "Draft (prose)", play: "Play (Intent Script)", renpy: "Code (Ren'Py)" } as const;
type Version = keyof typeof NAMES;

function context(cfg: ProjectConfig, sheets: Sheet[]): string {
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
  ].join("\n\n");
}

export interface UpdateRequest {
  from: Version;
  to: Version;
  /** The changed version as it was at the last sync ("" if never synced), and now. */
  before: string;
  after: string;
  /** The version to update, as it is now. */
  target: string;
}

/** The updated text of `to`. Throws on any failure; nothing is changed then. */
export async function claudeUpdate(apiKey: string, model: ClaudeModel, req: UpdateRequest, cfg: ProjectConfig, sheets: Sheet[]): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const content = [
    context(cfg, sheets),
    `Changed version: ${NAMES[req.from]}. Version to update: ${NAMES[req.to]}.`,
    `<changed_before>\n${req.before}\n</changed_before>`,
    `<changed_after>\n${req.after}\n</changed_after>`,
    `<to_update>\n${req.target}\n</to_update>`,
    `Return the full updated ${NAMES[req.to]}.`,
  ].join("\n\n");
  const message = await client.beta.messages
    .stream({
      model,
      max_tokens: 64000,
      // Haiku 5.5 has no server-side fallback; the others retry a declined request on another model.
      ...(model === "claude-haiku-5-5" ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: FORMAT },
      system: SYSTEM,
      messages: [{ role: "user", content }],
    })
    .finalMessage();
  if (message.stop_reason === "refusal") throw new Error("Claude declined this text");
  if (message.stop_reason === "max_tokens") throw new Error("the text is too long for one go");
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return (JSON.parse(text) as { text: string }).text.replace(/\s+$/, "") + "\n";
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
