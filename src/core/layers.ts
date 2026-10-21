// Seamless layer tabs: the same file seen as Draft (prose), Play (Intent
// Script, the source of truth) or Ren'Py code. A view is built chunk by chunk
// from the source, and remembers which source each rendered chunk came from.
// Going back, every chunk the writer left alone returns exactly as it was;
// only edited or new lines go through the conversion rules.

import type { Node, Script } from "./ast.ts";
import type { ProjectConfig } from "./config.ts";
import { draftToScript } from "./convert.ts";
import { plainText } from "./inline.ts";
import type { Sheet } from "./sheets.ts";
import { RenpyExporter } from "../exporters/renpy.ts";

export type Layer = "draft" | "play" | "renpy";

export interface LayerView {
  layer: Layer;
  text: string;
  /** Rendered chunk -> the source text it stands for, in order of appearance. */
  origins: Map<string, string[]>;
}

interface Chunk {
  start: number;
  end: number;
  text: string;
}

const indentOf = (s: string) => s.length - s.trimStart().length;

/** Top-level lines with their indented children; ::: blocks stay whole; blank lines alone. */
export function chunks(source: string): Chunk[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const out: Chunk[] = [];
  let i = 0;
  while (i < lines.length) {
    const start = i;
    const t = lines[i].trim();
    if (/^:::\s*\S/.test(t)) {
      i++;
      while (i < lines.length && lines[i].trim() !== ":::") i++;
      i++;
    } else if (t) {
      const base = indentOf(lines[i]);
      i++;
      while (i < lines.length && (lines[i].trim() === "" ? lines.slice(i).find((l) => l.trim()) !== undefined && indentOf(lines.slice(i).find((l) => l.trim())!) > base : indentOf(lines[i]) > base)) i++;
      // A trailing blank line belongs to the next chunk.
      while (i - 1 > start && lines[i - 1].trim() === "") i--;
    } else i++;
    out.push({ start: start + 1, end: Math.min(i, lines.length), text: lines.slice(start, Math.min(i, lines.length)).join("\n") });
  }
  return out;
}

function topNodes(script: Script): Node[] {
  return [...script.chapters.flatMap((c) => c.scenes.flatMap((s) => s.body)), ...script.blocks.flatMap((b) => b.body ?? [])];
}

function nodesIn(nodes: Node[], c: Chunk): Node[] {
  return nodes.filter((n) => n.line >= c.start && n.line <= c.end).sort((a, b) => a.line - b.line);
}

function remember(origins: Map<string, string[]>, rendered: string, source: string) {
  const q = origins.get(rendered) ?? [];
  q.push(source);
  origins.set(rendered, q);
}

/** One spoken or narrated line as a book would print it. */
function proseLine(n: Extract<Node, { n: "say" }>, cfg: ProjectConfig): string {
  const text = plainText(n.text).trim();
  const narrated = !n.speaker || ((n.narration || n.speaker === cfg.narrator) && !n.as);
  if (narrated) return text;
  const name = cfg.cast[n.speaker!]?.display ?? n.speaker!;
  const quoted = /[.]$/.test(text) ? `${text.slice(0, -1)},` : text;
  return `“${quoted}” ${name} says.`;
}

export function toLayer(layer: Layer, source: string, script: Script, cfg: ProjectConfig): LayerView {
  const origins = new Map<string, string[]>();
  if (layer === "play") return { layer, text: source, origins };
  const nodes = topNodes(script);
  const rpy = new RenpyExporter(cfg);
  const parts: string[] = [];
  // Menu options, ELSE and END lines belong with the line that opened them.
  const merged: Chunk[] = [];
  for (const c of chunks(source)) {
    const prev = merged[merged.length - 1];
    if (prev && c.text.trim() && /^\s*(?:>|\?|ELSE\b|END\b)/.test(c.text) && !nodes.some((n) => n.line === c.start) && nodesIn(nodes, prev).length)
      merged[merged.length - 1] = { start: prev.start, end: c.end, text: `${prev.text}\n${c.text}` };
    else merged.push(c);
  }
  for (const c of merged) {
    const inside = nodesIn(nodes, c);
    let rendered: string;
    if (!c.text.trim()) rendered = c.text;
    else if (layer === "draft") {
      // Plain dialogue and narration read as prose; anything else stays as written.
      rendered = inside.length && inside.every((n) => n.n === "say") && c.start === c.end
        ? inside.map((n) => proseLine(n as Extract<Node, { n: "say" }>, cfg)).join("\n")
        : c.text;
    } else {
      const code = inside.flatMap((n) => rpy.node(n, "", "intent"));
      rendered = code.length ? code.join("\n") : c.text.split("\n").map((l) => `# ${l}`).join("\n");
    }
    remember(origins, rendered, c.text);
    parts.push(rendered);
  }
  return { layer, text: parts.join("\n"), origins };
}

/** Back to Play: untouched chunks verbatim, everything else converted. */
export function fromLayer(view: LayerView, edited: string, cfg: ProjectConfig, sheets: Sheet[] = []): string {
  if (view.layer === "play") return edited;
  const pool = new Map([...view.origins].map(([k, v]) => [k, [...v]]));
  const sizes = [...new Set([...pool.keys()].map((k) => k.split("\n").length))].sort((a, b) => b - a);
  const lines = edited.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (!buffer.length) return;
    out.push(view.layer === "draft" ? draftLines(buffer, cfg, sheets) : renpyToScript(buffer.join("\n"), cfg));
    buffer = [];
  };
  let i = 0;
  while (i < lines.length) {
    let matched = false;
    for (const n of sizes) {
      if (i + n > lines.length) continue;
      const key = lines.slice(i, i + n).join("\n");
      const q = pool.get(key);
      if (q?.length) {
        flush();
        out.push(q.shift()!);
        i += n;
        matched = true;
        break;
      }
    }
    if (!matched) buffer.push(lines[i++]);
  }
  flush();
  return out.join("\n");
}

/** Each edited or new line is its own paragraph; tags the converter keeps as notes are dropped. */
function draftLines(lines: string[], cfg: ProjectConfig, sheets: Sheet[]): string {
  return lines
    .map((l) => {
      if (!l.trim()) return l;
      return draftToScript(l, cfg, [], sheets).script.split("\n").filter((x) => !x.startsWith("// tag:")).join("\n");
    })
    .join("\n");
}

function unRpy(s: string): string {
  return s
    .replace(/\{a=intent_stain:[^}]*\}(?:\{color=[^}]*\})?([^{]*)(?:\{\/color\})?\{\/a\}/g, "$1")
    .replace(/\{i\}([^{]*)\{\/i\}/g, "*$1*")
    .replace(/\{w=[\d.]*\}/g, " | ")
    .replace(/\{cps=\d+\}([^{]*)\{\/cps\}/g, "~$1~")
    .replace(/\\"/g, '"')
    .replace(/\[\[/g, "[")
    .replace(/\{\{/g, "{")
    .replace(/\s+\|\s+$/, "");
}

/**
 * Ren'Py back to Intent Script for what Intent itself writes: say lines, scene,
 * show, hide, music, sound, pauses and menus. Anything else is kept as a
 * ::: renpy block so nothing is lost.
 */
export function renpyToScript(code: string, cfg: ProjectConfig, pad = ""): string {
  const byId = new Map<string, string>();
  const byImage = new Map<string, string>();
  for (const [key, m] of Object.entries(cfg.cast)) {
    byId.set(m.id, key);
    byImage.set(m.image ?? m.id, key);
  }
  const reverse = (kind: "bg" | "cg" | "music" | "sound", file: string) => Object.entries(cfg.assets[kind]).find(([, v]) => v === file)?.[0] ?? file.replace(/_/g, " ");
  const exprName = (key: string, file: string) => Object.entries(cfg.cast[key]?.expressions ?? {}).find(([, v]) => v === file)?.[0] ?? file;

  const lines = code.split("\n");
  const out: string[] = [];
  let raw: string[] = [];
  const keep = () => {
    if (!raw.length) return;
    while (raw.length && !raw[raw.length - 1].trim()) raw.pop();
    if (raw.length) out.push(`${pad}::: renpy`, ...raw.map((l) => pad + l), `${pad}:::`);
    raw = [];
  };
  const emit = (s: string) => {
    keep();
    out.push(pad + s);
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    const base = indentOf(line);
    let m: RegExpMatchArray | null;
    i++;
    if (!t) {
      if (raw.length) raw.push(line);
      else out.push("");
      continue;
    }
    if (t.startsWith("# ")) {
      emit(t.slice(2));
    } else if ((m = t.match(/^scene\s+(bg|cg)\s+(\S+)(?:\s+with\s+\S+)?$/))) {
      emit(`[${m[1].toUpperCase()} ${reverse(m[1] as "bg" | "cg", m[2])}]`);
    } else if (t === "scene black" || t === "scene black with dissolve") {
      emit("[BLACK]");
    } else if (/^with\s+\S+$/.test(t)) {
      continue;
    } else if ((m = t.match(/^show\s+(\S+)(?:\s+(\S+))?(?:\s+at\s+.*)?$/)) && byImage.has(m[1])) {
      const key = byImage.get(m[1])!;
      emit(`[${key}${m[2] ? ` ${exprName(key, m[2])}` : ""}]`);
    } else if ((m = t.match(/^hide\s+(\S+)$/)) && byImage.has(m[1])) {
      emit(`[HIDE ${byImage.get(m[1])}]`);
    } else if ((m = t.match(/^play\s+music\s+"?([^"\s]+)"?/))) {
      emit(`[MUSIC ${reverse("music", m[1])}]`);
    } else if (/^stop\s+music/.test(t)) {
      emit("[MUSIC stop]");
    } else if ((m = t.match(/^play\s+sound\s+"?([^"\s]+)"?/))) {
      emit(`[SOUND ${reverse("sound", m[1])}]`);
    } else if ((m = t.match(/^pause\s+([\d.]+)$/))) {
      emit(`[PAUSE ${m[1]}]`);
    } else if ((m = t.match(/^"((?:[^"\\]|\\.)*)"$/))) {
      emit(unRpy(m[1]));
    } else if ((m = t.match(/^(\w+)\s+(?:(\S+)\s+)?"((?:[^"\\]|\\.)*)"$/)) && byId.has(m[1])) {
      const key = byId.get(m[1])!;
      const text = unRpy(m[3]);
      emit(key === cfg.narrator ? text : `${key}${m[2] ? ` (${exprName(key, m[2])})` : ""}: ${text}`);
    } else if (t === "menu:") {
      // Options at one indent deeper; their bodies deeper still.
      const body: string[] = [];
      while (i < lines.length && (!lines[i].trim() || indentOf(lines[i]) > base)) body.push(lines[i++]);
      const optIndent = Math.min(...body.filter((l) => l.trim()).map(indentOf));
      const parts: string[] = [];
      let prompt: string | null = null;
      let k = 0;
      let ok = true;
      while (k < body.length) {
        const bt = body[k].trim();
        if (!bt) {
          k++;
          continue;
        }
        let om: RegExpMatchArray | null;
        if ((om = bt.match(/^"((?:[^"\\]|\\.)*)":$/))) {
          const inner: string[] = [];
          k++;
          while (k < body.length && (!body[k].trim() || indentOf(body[k]) > optIndent)) inner.push(body[k++]);
          const innerBase = Math.min(...inner.filter((l) => l.trim()).map(indentOf));
          const innerCode = inner.map((l) => l.slice(Math.min(indentOf(l), innerBase))).join("\n").trim();
          parts.push(`> ${unRpy(om[1])}`, ...(innerCode && innerCode !== "pass" ? renpyToScript(innerCode, cfg, "    ").split("\n") : []));
        } else if (!prompt && (om = bt.match(/^(?:(\w+)\s+)?"((?:[^"\\]|\\.)*)"$/))) {
          prompt = unRpy(om[2]);
          k++;
        } else {
          ok = false;
          break;
        }
      }
      if (ok) {
        keep();
        out.push(`${pad}? ${prompt ?? ""}`.trimEnd(), ...parts.map((p) => pad + p));
      } else raw.push(line, ...body);
    } else {
      raw.push(line);
      while (i < lines.length && lines[i].trim() && indentOf(lines[i]) > base) raw.push(lines[i++]);
    }
  }
  keep();
  return out.join("\n");
}
