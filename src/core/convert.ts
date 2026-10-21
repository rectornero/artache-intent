// Draft -> Script with plain rules: no AI, no network. It splits prose into
// narration and dialogue and never rewrites the writer's words; anything it
// can't place stays narration, and anything it guessed carries a note.

import type { ProjectConfig } from "./config.ts";

export interface Conversion {
  script: string;
  /** Lines the writer should look at: guessed speakers, unclear quotes. */
  checks: string[];
}

const VERBS =
  "says|said|asks|asked|replies|replied|answers|answered|whispers|whispered|shouts|shouted|mutters|muttered|murmurs|murmured|calls|called|cries|cried|adds|added|snaps|snapped|sighs|sighed|laughs|laughed|tells|told|continues|continued|insists|insisted";
const PRONOUNS = "he|she|they|it";

function paragraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
}

/** Long narration is split at sentence ends, so one click never shows a wall of text. */
function splitNarration(p: string, max = 180): string[] {
  if (p.length <= max) return [p];
  const sentences = p.match(/[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g) ?? [p];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && (cur + s).length > max) {
      out.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function draftToScript(text: string, cfg: ProjectConfig, extraNames: string[] = []): Conversion {
  // Every way a character can be named -> their cast key.
  const names = new Map<string, string>();
  for (const [key, m] of Object.entries(cfg.cast)) {
    if (key === cfg.narrator) continue;
    names.set(key.toLowerCase(), key);
    if (m.display) names.set(m.display.toLowerCase(), key);
    for (const a of m.aliases ?? []) if (a.length > 1) names.set(a.toLowerCase(), key);
  }
  for (const n of extraNames) names.set(n.toLowerCase(), n);
  const nameRe = names.size
    ? new RegExp(`\\b(${[...names.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi")
    : null;
  const findNames = (s: string) => (nameRe ? [...s.matchAll(nameRe)].map((m) => names.get(m[1].toLowerCase())!) : []);

  const out: string[] = [];
  const checks: string[] = [];
  let lastMentioned: string | null = null;

  for (const para of paragraphs(text)) {
    if (/^(\*\s*){3,}$|^(-\s*){3,}$/.test(para)) {
      out.push("", "## New scene", "");
      checks.push("A scene break became \"## New scene\": give it a title.");
      continue;
    }
    const heading = para.match(/^#{1,2}\s+(.+)$/);
    if (heading) {
      out.push("", `## ${heading[1]}`, "");
      continue;
    }

    // Split into quoted speech and the text around it.
    const parts: Array<{ q: boolean; s: string }> = [];
    const re = /“([^”]*)”|"([^"]*)"/g;
    let at = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(para))) {
      if (m.index > at) parts.push({ q: false, s: para.slice(at, m.index) });
      parts.push({ q: true, s: m[1] ?? m[2] });
      at = m.index + m[0].length;
    }
    if (at < para.length) parts.push({ q: false, s: para.slice(at) });

    if (!parts.some((p) => p.q)) {
      out.push(...splitNarration(para));
      const n = findNames(para);
      if (n.length) lastMentioned = n[n.length - 1];
      continue;
    }

    // Who speaks: a tag next to a quote ("Free says", "says Free", "he says").
    let speaker: string | null = null;
    let guessed = false;
    for (const p of parts.filter((x) => !x.q)) {
      const tagName = p.s.match(new RegExp(`^[\\s,.—–-]*([A-Z][\\w.' ]*?)\\s+(?:${VERBS})\\b`)) ?? p.s.match(new RegExp(`\\b(?:${VERBS})\\s+([A-Z][\\w.']*)`));
      const named = tagName ? findNames(tagName[1]) : [];
      if (named.length) {
        speaker = named[0];
        break;
      }
      if (new RegExp(`^[\\s,.—–-]*(?:${PRONOUNS})\\s+(?:${VERBS})\\b`, "i").test(p.s) && lastMentioned) {
        speaker = lastMentioned;
        guessed = true;
      }
    }
    if (!speaker) {
      const n = findNames(parts.filter((x) => !x.q).map((x) => x.s).join(" "));
      if (n.length === 1) {
        speaker = n[0];
        guessed = true;
      }
    }

    for (const p of parts) {
      if (p.q) {
        // A quote that ends the speech before its tag uses a comma: “Go back,” he says.
        const line = p.s.trim().replace(/,$/, ".");
        if (speaker) out.push(`${speaker}: ${line}${guessed ? "  // check speaker" : ""}`);
        else {
          out.push(`“${p.s.trim()}”  // speaker unclear`);
          checks.push(`Speaker unclear: “${p.s.trim().slice(0, 40)}”`);
        }
        continue;
      }
      const rest = p.s.trim().replace(/^[,.;:—–-]+\s*/, "");
      if (!rest) continue;
      const isTag = new RegExp(`^(?:(?:${PRONOUNS})|[A-Z][\\w.' ]*?)\\s+(?:${VERBS})\\b|^(?:${VERBS})\\b`, "i").test(rest) && rest.length < 80;
      if (isTag && speaker) out.push(`// tag: ${rest}`);
      else out.push(...splitNarration(rest));
    }
    if (guessed && speaker) checks.push(`Guessed ${speaker} as the speaker of “${(parts.find((x) => x.q)?.s ?? "").trim().slice(0, 40)}”`);
    const n = findNames(parts.filter((x) => !x.q).map((x) => x.s).join(" "));
    lastMentioned = n.length ? n[n.length - 1] : (speaker ?? lastMentioned);
  }
  return { script: out.join("\n").replace(/\n{3,}/g, "\n\n").trim(), checks };
}

/** Replace one `::: draft` block (by its first line) with script, keeping the prose as `::: was-draft`. */
export function applyConversion(source: string, draftLine: number, converted: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const start = draftLine - 1;
  if (!/^\s*:::\s*draft\s*$/.test(lines[start] ?? "")) throw new Error(`No ::: draft block at line ${draftLine}`);
  let end = start + 1;
  while (end < lines.length && lines[end].trim() !== ":::") end++;
  const prose = lines.slice(start + 1, end);
  const replacement = [...converted.split("\n"), "::: was-draft", ...prose, ":::"];
  return [...lines.slice(0, start), ...replacement, ...lines.slice(end + 1)].join("\n");
}
