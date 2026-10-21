// Character, Place, Item and Minigame sheets: one plain-text `.sheet` file each,
// shown as a form. Sheets feed the cast and assets, and Intent fills each
// sheet's Usage from the scripts so it knows where it is used.

import type { Node, Script } from "./ast.ts";
import type { CastMember } from "./config.ts";
import { plainText } from "./inline.ts";
import { slug } from "./parser.ts";

export type SheetKind = "character" | "place" | "item" | "minigame";

export interface FieldSpec {
  key: string;
  label: string;
  hint?: string;
  long?: boolean;
}

export interface SectionSpec {
  id: string;
  label: string;
  fields: FieldSpec[];
}

export interface Sheet {
  kind: SheetKind;
  name: string;
  /** Field key -> value. Lists are comma-separated, long text keeps its line breaks. */
  fields: Record<string, string>;
  /** Free lines that are not `key: value`. */
  notes: string[];
}

const f = (key: string, label: string, hint?: string, long = false): FieldSpec => ({ key, label, hint, long });

export const SHEET_KINDS: Record<SheetKind, { label: string; plural: string; folder: string; sections: SectionSpec[] }> = {
  character: {
    label: "Character",
    plural: "Characters",
    folder: "characters",
    sections: [
      { id: "identity", label: "Identity", fields: [f("display", "Shown as", "Name in the game"), f("nicknames", "Nicknames", "Comma separated: the old man, Mr. F"), f("pronouns", "Pronouns", "he / she / they"), f("role", "Role", "Lead, suspect, shopkeeper…")] },
      { id: "look", label: "Look", fields: [f("appearance", "Appearance", "What a stranger notices", true), f("outfit", "Outfit"), f("color", "Colour", "#5b7bd5"), f("expressions", "Expressions", "neutral, smile, angry")] },
      { id: "voice", label: "Voice", fields: [f("speech", "How they talk", "Short sentences, never swears…", true), f("catchphrases", "Catchphrases"), f("never", "Words they never use"), f("sample", "Sample line", undefined, true)] },
      { id: "story", label: "Story", fields: [f("want", "Want"), f("need", "Need"), f("wound", "Wound"), f("secret", "Secret"), f("arc", "Arc", undefined, true), f("relations", "Relations", "Juu: sister. Tony: owes him money.", true)] },
      { id: "game", label: "Game", fields: [f("id", "Code id", "Used in Ren'Py and file names"), f("image", "Ren'Py image tag"), f("face", "MV face", "Actor1, 0"), f("entrance", "Usual entrance side", "left / right")] },
    ],
  },
  place: {
    label: "Place",
    plural: "Places",
    folder: "places",
    sections: [
      { id: "identity", label: "Identity", fields: [f("nicknames", "Other names", "the old mill, the mill"), f("region", "Region")] },
      { id: "look", label: "Look", fields: [f("description", "Description", undefined, true), f("variants", "Variants", "day, night, rain"), f("mood", "Mood")] },
      { id: "sound", label: "Sound", fields: [f("music", "Music cue"), f("ambience", "Ambience")] },
      { id: "story", label: "Story", fields: [f("history", "What happened here", undefined, true), f("who", "Who lives or works here")] },
      { id: "game", label: "Game", fields: [f("bg", "Ren'Py background", "Defaults to the place name"), f("map", "MV map id")] },
    ],
  },
  item: {
    label: "Item",
    plural: "Items",
    folder: "items",
    sections: [
      { id: "identity", label: "Identity", fields: [f("nicknames", "Other names"), f("description", "Description", undefined, true)] },
      { id: "game", label: "Game", fields: [f("mvItem", "MV item id"), f("icon", "Icon")] },
    ],
  },
  minigame: {
    label: "Minigame",
    plural: "Minigames",
    folder: "minigames",
    sections: [
      { id: "design", label: "Design", fields: [f("goal", "Goal", "What the player tries to do", true), f("rules", "Rules", undefined, true), f("inputs", "Player actions", "Examine, pick, drag…")] },
      { id: "outcome", label: "Outcome", fields: [f("win", "On win", "Where the story goes next"), f("lose", "On lose")] },
      { id: "data", label: "Data", fields: [f("reads", "Reads", "Flags, items, variables it checks"), f("writes", "Writes", "Flags, items, variables it sets")] },
      { id: "engine", label: "Engine", fields: [f("renpy", "Ren'Py screen or label"), f("mv", "MV plugin command")] },
    ],
  },
};

/** Phrases that announce a minigame in prose or script, e.g. "an Investigation minigame". */
export const MINIGAME_TRIGGERS = [
  /\b(?:[Aa]n?|[Tt]he)\s+((?:[A-Z][\w'-]*\s+){0,2}[A-Z][\w'-]*)\s+(?:minigame|mini-game|puzzle)\b/g,
  /\b(?:minigame|mini-game)[:\s]+((?:[A-Z][\w'-]*\s+){0,2}[A-Z][\w'-]*)/g,
];

export function sheetFileName(kind: SheetKind, name: string): string {
  return `${SHEET_KINDS[kind].folder}/${slug(name)}.sheet`;
}

export function listValue(v: string | undefined): string[] {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function parseSheet(text: string): Sheet | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let i = lines.findIndex((l) => l.trim());
  const head = lines[i]?.trim().match(/^@(character|place|item|minigame)\s+(.+)$/);
  if (!head) return null;
  const sheet: Sheet = { kind: head[1] as SheetKind, name: head[2].trim(), fields: {}, notes: [] };
  let last: string | null = null;
  for (i++; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t || /^#{1,3}\s/.test(t)) {
      if (!t && last) sheet.fields[last] += "\n";
      continue;
    }
    const kv = raw.match(/^([A-Za-z][\w]*)\s*:\s?(.*)$/);
    if (kv) {
      last = kv[1];
      sheet.fields[last] = kv[2].trim();
    } else if (last && /^\s+/.test(raw)) {
      sheet.fields[last] = `${sheet.fields[last]}${sheet.fields[last].endsWith("\n") || !sheet.fields[last] ? "" : "\n"}${t}`;
    } else {
      last = null;
      sheet.notes.push(t);
    }
  }
  for (const k of Object.keys(sheet.fields)) sheet.fields[k] = sheet.fields[k].replace(/\n+$/, "");
  return sheet;
}

export function serializeSheet(sheet: Sheet): string {
  const spec = SHEET_KINDS[sheet.kind];
  const out = [`@${sheet.kind} ${sheet.name}`];
  const known = new Set<string>();
  for (const sec of spec.sections) {
    const filled = sec.fields.filter((fl) => sheet.fields[fl.key]?.trim());
    sec.fields.forEach((fl) => known.add(fl.key));
    if (!filled.length) continue;
    out.push("", `## ${sec.label}`);
    for (const fl of filled) {
      const [first, ...rest] = sheet.fields[fl.key].split("\n");
      out.push(`${fl.key}: ${first}`, ...rest.map((r) => (r ? `  ${r}` : "")));
    }
  }
  const extra = Object.keys(sheet.fields).filter((k) => !known.has(k) && sheet.fields[k].trim());
  if (extra.length) {
    out.push("", "## More");
    for (const k of extra) out.push(`${k}: ${sheet.fields[k].split("\n").join("\n  ")}`);
  }
  if (sheet.notes.length) out.push("", "## Notes", ...sheet.notes);
  return `${out.join("\n")}\n`;
}

export function newSheet(kind: SheetKind, name: string, note?: string): string {
  return serializeSheet({ kind, name, fields: {}, notes: note ? [note] : [] });
}

/** Cast key for a character sheet: its code id or its name, upper case. */
export function castKeyOf(s: Sheet): string {
  return (s.fields.id || s.name).toUpperCase().replace(/[^A-Z0-9_]+/g, "_");
}

/** Character sheets as cast entries, merged under any cast written in intent.json. */
export function castFromSheets(sheets: Sheet[]): Record<string, CastMember> {
  const cast: Record<string, CastMember> = {};
  for (const s of sheets.filter((x) => x.kind === "character")) {
    const key = castKeyOf(s);
    const m: CastMember = { id: (s.fields.id || slug(s.name)).toLowerCase() };
    if (s.fields.display || s.name !== key) m.display = s.fields.display || s.name;
    if (s.fields.color) m.color = s.fields.color;
    if (s.fields.image) m.image = s.fields.image;
    const nick = listValue(s.fields.nicknames);
    if (s.name.toUpperCase() !== key) nick.push(s.name);
    if (nick.length) m.aliases = nick;
    const ex = listValue(s.fields.expressions);
    if (ex.length) m.expressions = Object.fromEntries(ex.map((e) => [e, e]));
    const face = s.fields.face?.match(/^(.+?)\s*,\s*(\d+)$/);
    if (face) m.face = [face[1], Number(face[2])];
    cast[key] = m;
  }
  return cast;
}

/** Background names from place sheets: every name and nickname maps to the bg asset. */
export function backgroundsFromSheets(sheets: Sheet[]): Record<string, string> {
  const bg: Record<string, string> = {};
  for (const s of sheets.filter((x) => x.kind === "place")) {
    const asset = s.fields.bg || slug(s.name);
    for (const n of [s.name, ...listValue(s.fields.nicknames)]) bg[n] = bg[n.toLowerCase()] = asset;
  }
  return bg;
}

/** Every way a sheet can be named in text, longest first. */
export function sheetNames(s: Sheet): string[] {
  const names = [s.name, ...listValue(s.fields.nicknames)];
  if (s.kind === "character" && s.fields.display) names.push(s.fields.display);
  return [...new Set(names.filter((n) => n.length > 1))].sort((a, b) => b.length - a.length);
}

export interface Usage {
  scenes: Array<{ file: string; title: string; line: number }>;
  /** Spoken lines, for characters. */
  lines: number;
  /** Expressions or variants the scripts ask for. */
  used: string[];
  /** Asked for by a script but missing from the sheet. */
  missing: string[];
  /** On the sheet but never used. */
  unused: string[];
}

function walk(nodes: Node[], visit: (n: Node) => void) {
  for (const n of nodes) {
    visit(n);
    if (n.n === "menu") n.options.forEach((o) => walk(o.body, visit));
    if (n.n === "if") n.branches.forEach((b) => walk(b.body, visit));
    if (n.n === "custom") n.items.forEach((it) => walk(it.body, visit));
  }
}

function textOf(n: Node): string {
  switch (n.n) {
    case "say":
      return plainText(n.text);
    case "draft":
    case "original":
    case "note":
    case "todo":
      return n.text;
    case "custom":
      return `${n.header} ${n.items.map((i) => `${i.key} ${i.value}`).join(" ")}`;
    case "cmd":
      return n.cmd.c === "describe" ? n.cmd.text : "";
    default:
      return "";
  }
}

export function sheetUsage(sheet: Sheet, scripts: Script[]): Usage {
  const key = castKeyOf(sheet);
  const names = sheetNames(sheet);
  const re = names.length ? new RegExp(`\\b(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i") : null;
  const bgNames = new Set([sheet.name, ...listValue(sheet.fields.nicknames), sheet.fields.bg].filter(Boolean).map((n) => n!.toLowerCase()));
  const u: Usage = { scenes: [], lines: 0, used: [], missing: [], unused: [] };
  const used = new Set<string>();
  for (const s of scripts) {
    for (const ch of s.chapters)
      for (const sc of ch.scenes) {
        let hit = false;
        walk(sc.body, (n) => {
          if (sheet.kind === "character") {
            if (n.n === "say" && (n.speaker === key || n.as === key)) {
              hit = true;
              if (n.speaker === key) u.lines++;
              if (n.mood) used.add(n.mood);
            }
            if (n.n === "cmd" && n.cmd.c === "sprite" && n.cmd.who.toUpperCase() === key) {
              hit = true;
              if (n.cmd.expression) used.add(n.cmd.expression);
            }
          }
          if (sheet.kind === "place" && n.n === "cmd" && n.cmd.c === "bg") {
            const words = n.cmd.name.toLowerCase();
            if (bgNames.has(words)) {
              hit = true;
              if (n.cmd.tint) used.add(n.cmd.tint);
            }
          }
          if (sheet.kind === "minigame" && n.n === "custom" && n.type === "MINIGAME" && n.header.trim().toLowerCase() === sheet.name.toLowerCase()) hit = true;
          if (!hit && re && re.test(textOf(n))) hit = true;
        });
        if (hit) u.scenes.push({ file: s.file, title: sc.title || ch.title, line: sc.line });
      }
  }
  const listed = listValue(sheet.kind === "character" ? sheet.fields.expressions : sheet.kind === "place" ? sheet.fields.variants : "");
  u.used = [...used];
  u.missing = u.used.filter((x) => !listed.includes(x));
  u.unused = listed.filter((x) => !used.has(x));
  return u;
}

/** Minigames named in prose or script that have no sheet yet. */
export function detectMinigames(text: string): string[] {
  const found = new Set<string>();
  for (const re of MINIGAME_TRIGGERS) for (const m of text.matchAll(re)) found.add(m[1].trim());
  for (const m of text.matchAll(/^\s*>>\s*MINIGAME\s*:\s*(.+)$/gm)) found.add(m[1].trim());
  return [...found];
}
