// Draft -> Script with plain rules: no AI, no network. It splits prose into
// narration and dialogue and never rewrites the writer's words; anything it
// can't place stays narration, and anything it guessed carries a note.

import type { ProjectConfig } from "./config.ts";
import { castKeyOf, detectMinigames, listValue, sheetNames, type Sheet } from "./sheets.ts";

export interface Conversion {
  script: string;
  /** Lines the writer should look at: guessed speakers, unclear quotes. */
  checks: string[];
}

// Speech verbs, present and past. A tag like "Edward agrees" also matches the
// general rule below, so a missing verb only costs certainty, not the line.
const VERBS =
  "says|said|asks|asked|replies|replied|answers|answered|whispers|whispered|shouts|shouted|mutters|muttered|murmurs|murmured|calls|called|cries|cried|adds|added|snaps|snapped|sighs|sighed|laughs|laughed|tells|told|continues|continued|insists|insisted|agrees|agreed|nods|nodded|smiles|smiled|grins|grinned|admits|admitted|explains|explained|protests|protested|warns|warned|offers|offered|suggests|suggested|interrupts|interrupted|repeats|repeated|notes|noted|observes|observed|groans|groaned|hisses|hissed|breathes|breathed|jokes|joked|teases|teased|pleads|pleaded|begs|begged|demands|demanded|orders|ordered|announces|announced|declares|declared|confesses|confessed|wonders|wondered|mumbles|mumbled|stammers|stammered|yells|yelled|screams|screamed|barks|barked|growls|growled|chuckles|chuckled|giggles|giggled|sneers|sneered|scoffs|scoffed|retorts|retorted|counters|countered|concedes|conceded|objects|objected|begins|began|finishes|finished|whimpers|whimpered|sobs|sobbed|corrects|corrected|promises|promised|reminds|reminded|guesses|guessed|shrugs|shrugged";
const PRONOUNS = "he|she|they|it";

// One line is one paragraph: editors wrap prose, writers don't.
function paragraphs(text: string): string[] {
  return text.split("\n").map((p) => p.trim()).filter(Boolean);
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

/** Pronoun a tag uses: "she says" -> "she". */
function tagPronoun(s: string): string | null {
  const m = s.match(new RegExp(`^[\\s,.—–-]*(${PRONOUNS})\\s+(?:${VERBS})\\b`, "i"));
  return m ? m[1].toLowerCase() : null;
}

export function draftToScript(text: string, cfg: ProjectConfig, extraNames: string[] = [], sheets: Sheet[] = []): Conversion {
  // Every way a character can be named -> their cast key.
  const names = new Map<string, string>();
  for (const [key, m] of Object.entries(cfg.cast)) {
    if (key === cfg.narrator) continue;
    names.set(key.toLowerCase(), key);
    if (m.display) names.set(m.display.toLowerCase(), key);
    for (const a of m.aliases ?? []) if (a.length > 1) names.set(a.toLowerCase(), key);
  }
  for (const n of extraNames) names.set(n.toLowerCase(), n);
  // Sheets add nicknames and pronouns, so "the old man said" and "she says" resolve.
  const pronouns = new Map<string, string[]>();
  for (const s of sheets.filter((x) => x.kind === "character")) {
    const key = castKeyOf(s);
    for (const n of sheetNames(s)) names.set(n.toLowerCase(), key);
    const p = listValue((s.fields.pronouns ?? "").replace(/\//g, ",")).map((x) => x.toLowerCase());
    if (p.length) pronouns.set(key, p);
  }
  const places = sheets.filter((x) => x.kind === "place");
  const placeRe = places.length
    ? new RegExp(`\\b(${places.flatMap((p) => sheetNames(p)).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i")
    : null;
  const placeOf = (s: string) => {
    const m = placeRe && s.match(placeRe);
    return m ? places.find((p) => sheetNames(p).some((n) => n.toLowerCase() === m[1].toLowerCase())) ?? null : null;
  };
  let here: string | null = null;
  const minigames = new Set(sheets.filter((x) => x.kind === "minigame").map((x) => x.name.toLowerCase()));
  const mentioned: string[] = [];
  const remember = (keys: string[]) => {
    for (const k of keys) {
      const i = mentioned.indexOf(k);
      if (i >= 0) mentioned.splice(i, 1);
      mentioned.push(k);
    }
  };
  /** The latest-mentioned character who uses this pronoun, and whether that is the only one. */
  const byPronoun = (p: string): { key: string; sure: boolean } | null => {
    if (!pronouns.size) return null;
    const fits = mentioned.filter((k) => pronouns.get(k)?.includes(p));
    return fits.length ? { key: fits[fits.length - 1], sure: fits.length === 1 } : null;
  };
  const stageFor = (para: string) => {
    const place = placeOf(para);
    if (place && place.name !== here) {
      here = place.name;
      const tint = ["night", "evening", "day"].find((t) => new RegExp(`\\b${t}\\b`, "i").test(para) && listValue(place.fields.variants).includes(t));
      out.push(`[BG ${place.name}${tint ? ` ${tint}` : ""}]`);
      if (place.fields.music) out.push(`[MUSIC ${place.fields.music}]`);
    }
  };
  const minigameLines = (para: string) => {
    for (const g of detectMinigames(para)) {
      out.push(`>> MINIGAME: ${g}`);
      if (!minigames.has(g.toLowerCase())) checks.push(`New minigame "${g}": a sheet for it was suggested.`);
    }
  };
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
      stageFor(para);
      out.push(...splitNarration(para));
      minigameLines(para);
      const n = findNames(para);
      remember(n);
      if (n.length) lastMentioned = n[n.length - 1];
      continue;
    }
    stageFor(parts.filter((x) => !x.q).map((x) => x.s).join(" "));

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
      // General rule: a short tag right after a quote, "Name verbs", names the speaker.
      const gen = p.s.match(/^[\s,.—–-]*([A-Z][\w'’]*(?:\s[A-Z][\w'’]*)?)\s+[a-z]+(?:s|ed)\b[^.!?]{0,50}[.!?]?\s*$/);
      if (gen) {
        const known = findNames(gen[1]);
        if (known.length) {
          speaker = known[0];
          break;
        }
        if (!/^(?:The|A|An|It|This|That|There|Then|And|But|He|She|They|We|I|You)$/.test(gen[1].split(" ")[0])) {
          speaker = gen[1].toUpperCase().replace(/[^A-Z0-9]+/g, "_");
          guessed = true;
          checks.push(`"${gen[1]}" speaks but has no sheet yet: make a Character sheet?`);
          break;
        }
      }
      const pro = tagPronoun(p.s);
      const fit = pro ? byPronoun(pro) : null;
      if (fit) {
        speaker = fit.key;
        guessed = !fit.sure;
        break;
      }
      if (pro && lastMentioned) {
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
      const isTag =
        (new RegExp(`^(?:(?:${PRONOUNS})|[A-Z][\\w.' ]*?)\\s+(?:${VERBS})\\b|^(?:${VERBS})\\b`, "i").test(rest) ||
          (speaker !== null && new RegExp(`^${speaker.replace(/_/g, "[ _]")}\\s+[a-z]+(?:s|ed)\\b`, "i").test(rest))) &&
        rest.length < 80;
      if (isTag && speaker) out.push(`// tag: ${rest}`);
      else out.push(...splitNarration(rest));
    }
    if (guessed && speaker) checks.push(`Guessed ${speaker} as the speaker of “${(parts.find((x) => x.q)?.s ?? "").trim().slice(0, 40)}”`);
    const n = findNames(parts.filter((x) => !x.q).map((x) => x.s).join(" "));
    remember(speaker ? [...n.filter((k) => k !== speaker), speaker] : n);
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
