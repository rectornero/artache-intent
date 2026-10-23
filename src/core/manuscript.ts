// Manuscript export: the Drafts, in script order, as chapters, scenes and
// paragraphs, ready for Word or PDF. Script lines a Draft still carries,
// comments and {{ notes for Claude }} are left out.

export type Run = { text: string; italic?: boolean };
export type Block =
  | { kind: "chapter"; title: string }
  | { kind: "scene"; title: string }
  | { kind: "break" }
  | { kind: "para"; runs: Run[] };

export interface ManuscriptOptions {
  title: string;
  author: string;
  /** Show scene headings; otherwise scenes are separated by a centred break. */
  sceneTitles: boolean;
  paper: "a4" | "letter";
}

const SKIP = /^\s*(\/\/|~\s|:::|>>|@|\+\s|!\s|TODO:|\?\s|>\s)/;

/** `*italics*` become italic runs; beats, slow-text marks and [[ links ]] become plain text. */
export function runsOf(line: string): Run[] {
  const plain = line
    .replace(/\[\[\s*([^\]|]+?)\s*(\|[^\]]*)?\]\]/g, "$1")
    .replace(/~([^~]+)~/g, "$1")
    .replace(/\s*\|\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  const runs: Run[] = [];
  const re = /\*([^*]+)\*/g;
  let at = 0;
  for (const m of plain.matchAll(re)) {
    if (m.index! > at) runs.push({ text: plain.slice(at, m.index) });
    runs.push({ text: m[1], italic: true });
    at = m.index! + m[0].length;
  }
  if (at < plain.length) runs.push({ text: plain.slice(at) });
  return runs;
}

/** One Draft as blocks. Each non-empty prose line is a paragraph. */
export function draftBlocks(draft: string, sceneTitles: boolean): Block[] {
  const out: Block[] = [];
  let sceneInChapter = 0;
  const text = draft.replace(/\r\n?/g, "\n").replace(/\{\{[\s\S]*?\}\}/g, "");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^(#{1,2})\s+(.*)$/);
    if (h) {
      if (h[1] === "#") {
        out.push({ kind: "chapter", title: h[2].trim() });
        sceneInChapter = 0;
      } else {
        if (sceneTitles) out.push({ kind: "scene", title: h[2].trim() });
        else if (sceneInChapter > 0) out.push({ kind: "break" });
        sceneInChapter++;
      }
      continue;
    }
    if (/^#{3,}\s/.test(line) || SKIP.test(line) || /^\[[^\]]*\]$/.test(line)) continue;
    const runs = runsOf(line);
    if (runs.length) out.push({ kind: "para", runs });
  }
  // A break with nothing after it, or two in a row, says nothing.
  return out.filter((b, i) => b.kind !== "break" || (out[i + 1] && out[i + 1].kind === "para" && out[i - 1]?.kind === "para"));
}

/** Every script's Draft, in the order given. */
export function manuscript(drafts: string[], opts: Pick<ManuscriptOptions, "sceneTitles">): Block[] {
  return drafts.flatMap((d) => draftBlocks(d, opts.sceneTitles));
}

export const manuscriptWords = (blocks: Block[]) =>
  blocks.reduce((n, b) => n + (b.kind === "para" ? b.runs.map((r) => r.text).join("").match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0 : 0), 0);
