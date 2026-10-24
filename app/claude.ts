// Claude keeps Draft, Play and Code in step, on the writer's own API key, only
// when the writer asks. The key lives in this device's app storage only:
// never in project files, never in exports.

import spec from "../docs/SPEC.md?raw";
import type { ProjectConfig } from "../src/core/config.ts";
import { SHEET_KINDS, type Sheet, type SheetKind } from "../src/core/sheets.ts";
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

const SYSTEM = `You keep the versions of a game script in step for a writer:
- Draft: the story as prose, in the writer's own words.
- Play: the same story in Intent Script, the plain-text format described below.
- Code: the Ren'Py code for it, as Intent generates it, possibly with the writer's own tweaks.
- MV: the RPG Maker MV common events for it, as JSON ({"switches", "variables", "events", "commonEvents": [{"id", "name", "trigger", "switchId", "list": [{"code", "indent", "parameters"}]}]}), as Intent generates it, possibly with the writer's own tweaks.

You get the version the writer changed, before and after, and the current text of the version to update. Apply to that version exactly the changes the edit calls for, written the way that version is written, and keep everything else in it unchanged, character for character, including anything the writer edited there by hand.

Rules:
- Never reword the writer's text. Dialogue and narration carry over word for word between Draft and Play.
- Draft to Play: speech tags ("she says", "Edward agrees") name the speaker and are dropped; actions in tags stay as narration. Use the cast keys (ALL CAPS). Work out who "he", "she" or "they" is from each character's gender, nicknames and the story. Place changes add [BG Name] and the place's [MUSIC ...]; minigames add ">> MINIGAME: Name".
- Play to Draft: write new script lines as prose in the style of the surrounding draft ("“Line,” Tony says."). Stage directions become short prose only when the draft already describes such things; otherwise leave them out.
- Play to Code and back: follow how the existing code renders each kind of line.
- Play to MV and back: follow how the existing events render each kind of line (101 face/name then 401 text lines, 102/402/404 choices, 111/411/412 conditions, 121/122 switches and variables, 117 calls). Keep the JSON valid, one command per line, and keep the ids, "switches", "variables" and "events" as they are unless a new one is needed.
- If the version to update is empty, write it in full from the changed version.
- Draft to Play: the Draft may still hold keywords or a sketch where the writer has not written the scene out yet; turn them into Play as best you can. A line starting with "/" or "»" is a request to Claude, not story: leave it out of Play. A leading "\\" marks intent: drop the tag.
- Where you can't be sure, add a note line just above: "// check: why" in Play, "# check: why" in Code, "[check: why]" in Draft; in MV, a comment command {"code":108,"indent":…,"parameters":["check: why"]}.

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

const NAMES = { draft: "Draft (prose)", play: "Play (Intent Script)", renpy: "Code (Ren'Py)", mv: "MV (RPG Maker MV events, JSON)" } as const;
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
    `This request comes from Artache Intent Writer, a game script editor. Please do the task below and answer in the format asked at the end, with nothing else around it.`,
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

const NAMES_SHORT = { draft: "Draft", play: "Play", renpy: "Code", mv: "MV" } as const;

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

const UNFOLD_SYSTEM = `You help a game writer turn their Draft into its final form. They practise intent writing: each part is written at the level of detail it deserves, and requests to you sit in the same text as the story. The writer marks every part themselves.

- <part n="…">: keywords or a sketch of what happens, marked by the writer as intent. Write it out as finished prose (and dialogue, when it calls for it). A leading "\\" is the writer's tag for intent: drop it.
- <unpolished>: the writer's own words, not finished yet: they will polish them later themselves (a leading "%" is their tag). Never change them and never write them out. Read them as the writer's notes: what they mean to happen, the tone, a reminder to themselves. Let them guide the parts you write.
- Text outside the tags is the writer's finished text (and headings, comments): never change it. Read it to match their style and to know what happens around each part.
- <request n="…">: an ask for you, not story, in full sentences or as bare keywords alike (a leading "/" or "»" is the writer's tag). Follow it while you write the parts. When it asks for something outside the story text (a minigame, character, place, item or clue), draft that as a sheet. Answer each request in one or two sentences.
- Also give one writing tip: a short, friendly craft lesson drawn from what you just did with THIS text (for example how a keyword became a concrete image, or why a line of dialogue now carries the subtext). One or two sentences, quoting the writer's own words. Write it in the language of the writer's text. Never lecture or judge.

Each part you write:
- does what its words say, and no more: don't resolve plot points the writer didn't ask for;
- fits exactly where it stands, flowing from the text before it into the text after it;
- matches the writer's finished text around it: tense, person, sentence length, how dialogue is tagged, how much description;
- keeps every character true to their sheet: names, nicknames, gender, voice, what they know;
- is written in the language of the writer's text;
- has the length the scene suggests, unless the writer gives one ("about 300 words").

Return one text per <part>, in order, without the tags and without repeating the text around it.`;

const sheetKeys = () => (Object.keys(SHEET_KINDS) as SheetKind[]).map((k) => `${k}: ${SHEET_KINDS[k].sections.flatMap((s) => s.fields.filter((f) => !f.prompts).map((f) => f.key)).join(", ")}`).join("\n");

/** What ✦ Unfold did with a request: a short answer, and a sheet when one was asked for. */
export interface Answer {
  n: number;
  reply: string;
  sheet?: { kind: SheetKind; name: string; fields: { key: string; value: string }[] };
}
export interface Unfolded {
  parts: string[];
  answers: Answer[];
  /** One craft tip drawn from this text, for writers who want to learn. */
  tip: string;
}

/** ✦ Unfold the Draft: write out every intent part, and carry out the requests. */
export function unfoldJob(marked: string, parts: number, asks: number, cfg: ProjectConfig, sheets: Sheet[]): Job<Unfolded> {
  const kinds = Object.keys(SHEET_KINDS);
  const read = (d: unknown): Unfolded => {
    const o = (d ?? {}) as { parts?: unknown; answers?: unknown; tip?: unknown };
    const answers = (Array.isArray(o.answers) ? o.answers : []).map((a) => a as Answer).filter((a) => a && typeof a.reply === "string");
    for (const a of answers) if (a.sheet && (!kinds.includes(a.sheet.kind) || !a.sheet.name?.trim())) delete a.sheet;
    return { parts: Array.isArray(o.parts) ? o.parts.map((x) => String(x ?? "")) : [], answers, tip: typeof o.tip === "string" ? o.tip.trim() : "" };
  };
  return {
    title: "Unfold the Draft",
    system: UNFOLD_SYSTEM,
    content: [
      context(cfg, sheets),
      `<sheet_fields>\nThe fields each kind of sheet has:\n${sheetKeys()}\n</sheet_fields>`,
      `<draft>\n${marked}\n</draft>`,
      `Return the ${parts} part${parts === 1 ? "" : "s"}${asks ? ` and carry out the ${asks} request${asks === 1 ? "" : "s"}` : ""}.`,
    ].join("\n\n"),
    schema: {
      type: "object",
      properties: {
        parts: { type: "array", items: { type: "string" } },
        answers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              n: { type: "integer" },
              reply: { type: "string" },
              sheet: {
                type: "object",
                properties: {
                  kind: { type: "string", enum: kinds },
                  name: { type: "string" },
                  fields: { type: "array", items: { type: "object", properties: { key: { type: "string" }, value: { type: "string" } }, required: ["key", "value"], additionalProperties: false } },
                },
                required: ["kind", "name", "fields"],
                additionalProperties: false,
              },
            },
            required: ["n", "reply"],
            additionalProperties: false,
          },
        },
        tip: { type: "string" },
      },
      required: ["parts", "answers", "tip"],
      additionalProperties: false,
    },
    effort: "medium",
    maxTokens: 32000,
    thinking: true,
    read,
    pasteAs: `JSON only, inside one fenced block (\`\`\`json … \`\`\`), shaped like:\n{"parts": ["text of part 1", "text of part 2"], "answers": [{"n": 1, "reply": "…", "sheet": {"kind": "minigame", "name": "…", "fields": [{"key": "…", "value": "…"}]}}], "tip": "…"}\nLeave out "sheet" when a request needs none.`,
    readPasted: (a) => {
      const text = fenced(a);
      return read(JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)));
    },
  };
}

export type Stretch = "page" | "part" | "chapter";
export const STRETCHES: Record<Stretch, { label: string; short: string; words: string; note: string }> = {
  page: { label: "Page", short: "~300 words", words: "about 300 words", note: "Carry on the moment where it stands." },
  part: { label: "Part", short: "~1,200 words", words: "about 1,200 words", note: "Write the next scene, through to a natural break. If the draft marks scenes with headings (\"## Title\"), start the new one with a heading in the same style." },
  chapter: { label: "Chapter", short: "~4,000 words", words: "about 4,000 words, in several scenes", note: "Write the next chapter. If the draft marks chapters with headings (\"# CHAPTER 2 · Title\"), start with the next one in the same style, and mark its scenes the way the draft does." },
};

const TOGETHER_SYSTEM = `You write a game story together with its writer. You get their Draft (prose for a visual novel or RPG) and continue it from exactly where it ends.

- Match the writer's style: tense, person, sentence length, how dialogue is tagged ("“Line,” Tony says."), and how much description there is. Read like them, not like you.
- Keep every character true to their sheet: names, nicknames, gender, voice, what they know so far.
- Move the story forward the way the draft is heading, and follow the writer's direction if they give one. Don't wrap up threads the writer is clearly saving for later, and don't add major characters or twists that aren't set up.
- Places and minigames from the sheets can appear; name them the way the sheets do.
- Requests to you (lines starting with "/" or "»") are not story: don't continue or repeat them.
- Return only the new text, starting right after the draft's last words, without repeating any of it.`;

/** Continue the Draft by a page, a part or a chapter; the answer is the new text only. */
export function togetherJob(draft: string, stretch: Stretch, direction: string, cfg: ProjectConfig, sheets: Sheet[]): Job<string> {
  const s = STRETCHES[stretch];
  const trim = (t: string) => t.replace(/^\n+/, "").replace(/\s+$/, "");
  return {
    title: `Write the next ${s.label.toLowerCase()} together`,
    system: TOGETHER_SYSTEM,
    content: [
      context(cfg, sheets),
      `<draft>\n${draft.replace(/\s+$/, "")}\n</draft>`,
      `Continue it: ${s.words}. ${s.note}`,
      direction.trim() ? `The writer's direction: ${direction.trim()}` : "The writer gave no direction: follow where the story is going.",
    ].join("\n\n"),
    schema: FORMAT.schema,
    effort: "medium",
    maxTokens: 32000,
    thinking: true,
    read: (d) => trim((d as { text: string }).text),
    pasteAs: `The new text only, inside one fenced code block (\`\`\`text … \`\`\`).`,
    readPasted: (a) => trim(fenced(a)),
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

// ✦ Opinion: an honest editor's read of a part of the script. Nothing in the text changes.

export type Opinion = {
  summary: string;
  strengths: { point: string; quote: string }[];
  weaknesses: { point: string; quote: string }[];
  fixes: { quote: string; fix: string; why: string }[];
};

const OPINION_SYSTEM = `You are an experienced, honest and warm editor of fiction and game scripts. The writer asks for your opinion on one part of their work. Read it as a reader would, then as an editor.

Give:
- summary: two or three sentences, your overall impression, plain and specific to this text.
- strengths: what works and why (voice, dialogue, pacing, tension, character, imagery, structure). Each with a short exact quote from the part (a few words) it shows in, or "" when it's about the whole.
- weaknesses: what doesn't work yet and why, most important first. Each with a short exact quote, or "".
- fixes: concrete changes the writer could make, most useful first. Each with a short exact quote of what to change, the fix (a rewrite of those words when that's the clearest way, or a short instruction), and why it helps.

In a Draft, a line may start with the writer's tag: "\\" intent (keywords or a sketch, still to be written out), "%" unpolished (their own words, to finish later) or "/" a request to an assistant (not story). Judge intent and unpolished lines as plans and rough text, not as finished prose, and leave requests out of your judgement.

Be specific: name the line, the beat, the word. No generic advice, no flattery, no grammar nitpicks unless they hurt the reading. Judge only the part you're given; the rest of the script and the sheets are background. Respect the writer's style and intent: suggest, don't take over. If the writer asks about something in particular, answer that first. Keep each point to one or two sentences. Write in English.`;

const OPINION_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "object", properties: { point: { type: "string" }, quote: { type: "string" } }, required: ["point", "quote"], additionalProperties: false } },
    weaknesses: { type: "array", items: { type: "object", properties: { point: { type: "string" }, quote: { type: "string" } }, required: ["point", "quote"], additionalProperties: false } },
    fixes: { type: "array", items: { type: "object", properties: { quote: { type: "string" }, fix: { type: "string" }, why: { type: "string" } }, required: ["quote", "fix", "why"], additionalProperties: false } },
  },
  required: ["summary", "strengths", "weaknesses", "fixes"],
  additionalProperties: false,
};

function readOpinion(d: unknown): Opinion {
  const o = (d ?? {}) as Partial<Opinion>;
  const list = <T,>(x: unknown) => (Array.isArray(x) ? (x as T[]) : []);
  return {
    summary: String(o.summary ?? ""),
    strengths: list<Opinion["strengths"][number]>(o.strengths).filter((s) => s?.point).map((s) => ({ point: s.point, quote: s.quote ?? "" })),
    weaknesses: list<Opinion["weaknesses"][number]>(o.weaknesses).filter((s) => s?.point).map((s) => ({ point: s.point, quote: s.quote ?? "" })),
    fixes: list<Opinion["fixes"][number]>(o.fixes).filter((f) => f?.fix).map((f) => ({ quote: f.quote ?? "", fix: f.fix, why: f.why ?? "" })),
  };
}

/** Claude's opinion on `part` of the script `file` (in `version`), with the whole text as background. */
export function opinionJob(o: { file: string; version: Version; part: string; label: string; whole: string; ask: string }, cfg: ProjectConfig, sheets: Sheet[]): Job<Opinion> {
  return {
    title: `Opinion on ${o.label}`,
    system: OPINION_SYSTEM,
    content: [
      context(cfg, sheets),
      o.part === o.whole ? "" : `The whole script ${o.file}, ${NAMES[o.version]}, as background:\n<script>\n${o.whole}\n</script>`,
      `The part to give your opinion on (${o.label}, ${NAMES[o.version]}):\n<part>\n${o.part}\n</part>`,
      o.ask.trim() ? `The writer asks: ${o.ask.trim()}` : "",
    ].filter(Boolean).join("\n\n"),
    schema: OPINION_SCHEMA,
    effort: "medium",
    maxTokens: 16000,
    thinking: true,
    read: readOpinion,
    pasteAs: `JSON only, inside one fenced block (\`\`\`json … \`\`\`), shaped like:\n{"summary": "…", "strengths": [{"point": "…", "quote": "a few exact words"}], "weaknesses": [{"point": "…", "quote": "…"}], "fixes": [{"quote": "…", "fix": "…", "why": "…"}]}`,
    readPasted: (a) => {
      const text = fenced(a);
      return readOpinion(JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)));
    },
  };
}
