// Claude keeps Draft, Play and Code in step, on the writer's own API key, only
// when the writer asks. The key lives in this device's app storage only:
// never in project files, never in exports.

import spec from "../docs/SPEC.md?raw";
import type { ProjectConfig } from "../src/core/config.ts";
import type { Sheet } from "../src/core/sheets.ts";
import { ISSUE_KINDS, numbered, type Issue } from "../src/core/checks.ts";

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

/** How Intent asks Claude: on the API key, or by copy and paste through the Claude app or Claude Code. */
export type ClaudeVia = "api" | "paste";
const VIA_KEY = "artache-intent.claude-via";

export function loadVia(): ClaudeVia {
  try {
    return localStorage.getItem(VIA_KEY) === "paste" ? "paste" : "api";
  } catch {
    return "api";
  }
}

export function saveVia(v: ClaudeVia) {
  try {
    localStorage.setItem(VIA_KEY, v);
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
- Draft to Play: a {{ note }} in the Draft is a part the writer left for Claude to write later; put it in Play as a comment line "// write: note" and don't write the part.
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

/**
 * One job for Claude. It runs on the writer's API key, or it is copied out for
 * the writer to paste into the Claude app or Claude Code, and the answer pasted back.
 */
export interface Job<T> {
  /** What the job does, in a few words ("Update Code from Play"). */
  title: string;
  system: string;
  content: string;
  schema: Record<string, unknown>;
  effort: "low" | "medium";
  maxTokens: number;
  thinking: boolean;
  /** The structured answer from the API. */
  read: (data: unknown) => T;
  /** How the pasted answer should look, and how to read it. */
  pasteAs: string;
  readPasted: (answer: string) => T;
}

/** Runs a job on the API. Throws on any failure; nothing is changed then. */
export async function runJob<T>(apiKey: string, model: ClaudeModel, job: Job<T>): Promise<T> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const message = await client.beta.messages
    .stream({
      model,
      max_tokens: job.maxTokens,
      // Haiku 5.5 has no server-side fallback; the others retry a declined request on another model.
      ...(model === "claude-haiku-5-5" ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
      ...(job.thinking ? { thinking: { type: "adaptive" as const } } : {}),
      output_config: { effort: job.effort, format: { type: "json_schema", schema: job.schema } },
      system: job.system,
      messages: [{ role: "user", content: job.content }],
    })
    .finalMessage();
  if (message.stop_reason === "refusal") throw new Error("Claude declined this text");
  if (message.stop_reason === "max_tokens") throw new Error("the text is too long for one go");
  return job.read(JSON.parse(message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")));
}

/** The whole job as one message to paste into the Claude app or Claude Code. */
export function handoffText(job: Job<unknown>): string {
  return [
    `This request comes from Artache Intent, a game script editor. Please do the task below and answer in the format asked at the end, with nothing else around it.`,
    `<instructions>\n${job.system}\n</instructions>`,
    job.content,
    `<answer_format>\n${job.pasteAs}\n</answer_format>`,
  ].join("\n\n");
}

/** The inside of the longest ``` fenced block in a reply, or the whole reply. */
export function fenced(answer: string): string {
  const blocks = [...answer.matchAll(/```[\w-]*[^\S\n]*\n([\s\S]*?)\n?```/g)].map((m) => m[1]);
  return blocks.length ? blocks.sort((a, b) => b.length - a.length)[0] : answer.trim();
}

const NAMES_SHORT = { draft: "Draft", play: "Play", renpy: "Code" } as const;

export interface UpdateRequest {
  from: Version;
  to: Version;
  /** The changed version as it was at the last sync ("" if never synced), and now. */
  before: string;
  after: string;
  /** The version to update, as it is now. */
  target: string;
}

/** Bring `to` in step with the changes made to `from`; the answer is the full new text. */
export function updateJob(req: UpdateRequest, cfg: ProjectConfig, sheets: Sheet[]): Job<string> {
  const tidy = (t: string) => t.replace(/\s+$/, "") + "\n";
  return {
    title: `Update ${NAMES_SHORT[req.to]} from ${NAMES_SHORT[req.from]}`,
    system: SYSTEM,
    content: [
      context(cfg, sheets),
      `Changed version: ${NAMES[req.from]}. Version to update: ${NAMES[req.to]}.`,
      `<changed_before>\n${req.before}\n</changed_before>`,
      `<changed_after>\n${req.after}\n</changed_after>`,
      `<to_update>\n${req.target}\n</to_update>`,
      `Return the full updated ${NAMES[req.to]}.`,
    ].join("\n\n"),
    schema: FORMAT.schema,
    effort: "medium",
    maxTokens: 64000,
    thinking: true,
    read: (d) => tidy((d as { text: string }).text),
    pasteAs: `The full updated ${NAMES[req.to]}, and only that, inside one fenced code block (\`\`\`text … \`\`\`).`,
    readPasted: (a) => tidy(fenced(a)),
  };
}

/** The updated text of `to`. Throws on any failure; nothing is changed then. */
export const claudeUpdate = (apiKey: string, model: ClaudeModel, req: UpdateRequest, cfg: ProjectConfig, sheets: Sheet[]) => runJob(apiKey, model, updateJob(req, cfg, sheets));

const FILL_SYSTEM = `You help a game writer finish the Draft of a visual novel or RPG scene. The Draft is prose. The writer wrote some parts in full and left others as short notes, marked <write n="…">note</write>, for you to write.

Write each marked part as prose that:
- does what the note says, and no more: don't resolve plot points the note doesn't ask for;
- fits exactly where it stands, flowing from the text before it into the text after it;
- matches the writer's own style around it: tense, person, sentence length, how dialogue is tagged ("“Line,” Tony says."), and how much description there is;
- keeps every character true to their sheet: names, nicknames, gender, voice, what they know;
- respects any length the note gives ("about 300 words", "two lines"); otherwise keep it as long as the scene around it suggests.

Return one text per marked part, in order, without the tags and without repeating the writer's text around it.`;

/** Write the {{ }} parts of a Draft; the answer is one text per gap, in order. */
export function fillJob(marked: string, count: number, cfg: ProjectConfig, sheets: Sheet[]): Job<string[]> {
  const read = (list: unknown) => (Array.isArray(list) ? list.map((x) => String(x ?? "")) : []);
  return {
    title: `Write ${count} part${count === 1 ? "" : "s"} of the Draft`,
    system: FILL_SYSTEM,
    content: [context(cfg, sheets), `<draft>\n${marked}\n</draft>`, `Write the ${count} marked part${count === 1 ? "" : "s"}.`].join("\n\n"),
    schema: { type: "object", properties: { parts: { type: "array", items: { type: "string" } } }, required: ["parts"], additionalProperties: false },
    effort: "medium",
    maxTokens: 32000,
    thinking: true,
    read: (d) => read((d as { parts: unknown }).parts),
    pasteAs: `Each part in order, each inside its own fenced code block (\`\`\`text … \`\`\`), numbered like the marks: part 1 first.`,
    readPasted: (a) => {
      const blocks = [...a.matchAll(/```[\w-]*[^\S\n]*\n([\s\S]*?)\n?```/g)].map((m) => m[1]);
      return blocks.length ? blocks : [a.trim()];
    },
  };
}

const PROMPT_SYSTEM = `You write prompts for generative tools from a game writer's sheet.
- Image prompts are for an image generator: one paragraph, concrete and visual (subject, look, clothing, pose or framing, setting, light, colour, mood). Characters: a visual novel character sprite, full body, plain background unless the sheet says otherwise. Places: a visual novel background, no people unless the sheet says so. No camera brand names, no artist names.
- Song prompts are for a music generator: genre, mood, tempo, instruments, structure, and what it should evoke for this character or place. Instrumental unless the sheet asks for lyrics.
- Use only what the sheet says or clearly implies; don't invent backstory. Give a fresh angle if earlier prompts are listed.
- Write in English. Return just the prompt.`;

/** One new image or song prompt drawn from a sheet. */
export function promptJob(kind: "image" | "song", sheet: Sheet, earlier: string[]): Job<string> {
  const fields = Object.entries(sheet.fields).filter(([k, v]) => v.trim() && !k.endsWith("Prompts")).map(([k, v]) => `${k}: ${v}`).join("\n");
  return {
    title: `Write a ${kind} prompt for ${sheet.name}`,
    system: PROMPT_SYSTEM,
    content: `Write one ${kind} prompt for this ${sheet.kind}.\n\n@${sheet.kind} ${sheet.name}\n${fields || "(no details yet)"}${sheet.notes.length ? `\nNotes: ${sheet.notes.join(" ")}` : ""}${earlier.length ? `\n\nEarlier prompts:\n${earlier.map((p) => `- ${p}`).join("\n")}` : ""}`,
    schema: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"], additionalProperties: false },
    effort: "low",
    maxTokens: 4000,
    thinking: false,
    read: (d) => (d as { prompt: string }).prompt.trim(),
    pasteAs: "Just the prompt, as plain text.",
    readPasted: (a) => fenced(a),
  };
}

export const claudePrompt = (apiKey: string, model: ClaudeModel, kind: "image" | "song", sheet: Sheet, earlier: string[]) => runJob(apiKey, model, promptJob(kind, sheet, earlier));

const CHECK_SYSTEM = `You are a story editor checking a game script for problems a careful reader or player would notice. The scripts are in Intent Script (reference below); each line starts with its number and "| ".

Report only real problems, each tied to the line where it shows:
- continuity: something contradicts what happened earlier (an object, injury, knowledge, who is present, what was said).
- sheet: the text contradicts a character's, place's or item's sheet (gender, role, look, facts, relationships).
- timeline: events out of order, impossible timing, days or times that don't add up.
- thread: a setup, promise, clue or question that is never paid off in what you were given, or a payoff with no setup. Only when you read the whole project, or when it's clearly inside the given script.
- name: one person, place or thing named or spelled two ways.
- other: anything else that would confuse a reader. Not style, not taste, not grammar.

Each problem: the file, the line number, a short exact quote copied from that line (a few words, no line number), a one-sentence problem, and a one-sentence suggested fix in the writer's terms. Severity: high if it breaks the story, medium if a reader would notice, low if minor. Don't repeat a problem on every line it touches: report it once, where it first goes wrong. Write in English. If there are none, return an empty list.

Intent Script reference:

${spec}`;

const CHECK_FORMAT = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    properties: {
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            file: { type: "string" },
            line: { type: "integer" },
            quote: { type: "string" },
            kind: { type: "string", enum: [...ISSUE_KINDS] },
            severity: { type: "string", enum: ["high", "medium", "low"] },
            problem: { type: "string" },
            suggestion: { type: "string" },
          },
          required: ["file", "line", "quote", "kind", "severity", "problem", "suggestion"],
          additionalProperties: false,
        },
      },
    },
    required: ["issues"],
    additionalProperties: false,
  },
};

type Found = Omit<Issue, "id">;

/** Problems in `check` (script file -> Play text), read against the sheets; `whole` when it's every script. */
export function checkJob(check: Record<string, string>, whole: boolean, cfg: ProjectConfig, sheets: Sheet[]): Job<Found[]> {
  const block = Object.entries(check).map(([f, t]) => `<script file="${f}">\n${numbered(t)}\n</script>`).join("\n\n");
  const keep = (list: Found[]) =>
    list.filter((i) => check[i.file] !== undefined && i.problem).map((i) => ({
      ...i,
      line: Number(i.line) || 1,
      kind: (ISSUE_KINDS as readonly string[]).includes(i.kind) ? i.kind : "other",
      severity: ["high", "medium", "low"].includes(i.severity) ? i.severity : "medium",
      quote: i.quote ?? "",
      suggestion: i.suggestion ?? "",
    }));
  return {
    title: whole ? "Check the whole story" : `Check ${Object.keys(check).join(", ")}`,
    system: CHECK_SYSTEM,
    content: [
      context(cfg, sheets),
      `Scripts to check:\n\n${block}`,
      whole ? "This is the whole project." : "This is one script of a longer project: other chapters may explain things it leaves open, so only report a loose thread when it's clearly inside this script.",
    ].join("\n\n"),
    schema: CHECK_FORMAT.schema,
    effort: "medium",
    maxTokens: 32000,
    thinking: true,
    read: (d) => keep((d as { issues: Found[] }).issues),
    pasteAs: `JSON only, inside one fenced block (\`\`\`json … \`\`\`), shaped like:\n{"issues": [{"file": "cap1.intent", "line": 12, "quote": "a few exact words", "kind": "${ISSUE_KINDS.join(" | ")}", "severity": "high | medium | low", "problem": "…", "suggestion": "…"}]}\nAn empty list if there are none.`,
    readPasted: (a) => {
      const text = fenced(a);
      const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      return keep((JSON.parse(json) as { issues: Found[] }).issues ?? []);
    },
  };
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
