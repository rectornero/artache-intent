// Manuscript export: the Drafts, in script order, as chapters, scenes and
// paragraphs, ready for Word or PDF. Script lines a Draft still carries,
// comments and {{ notes for Claude }} are left out.

export type Run = { text: string; italic?: boolean; bold?: boolean; code?: boolean };
export type Block =
  | { kind: "chapter"; title: string }
  | { kind: "scene"; title: string }
  | { kind: "break" }
  | { kind: "para"; runs: Run[]; bullet?: boolean };

export interface ManuscriptOptions {
  title: string;
  author: string;
  /** Show scene headings; otherwise scenes are separated by a centred break. */
  sceneTitles: boolean;
  paper: "a4" | "letter";
}

const SKIP = /^\s*(\/\/|~\s|:::|>>|@|\+\s|!\s|TODO:|\?\s|>\s)/;

/** The writer's **bold**, *italics* and `code-like` text become runs; beats, slow-text marks, [[ links ]] and the leading backslash of intent become plain text. */
export function runsOf(line: string): Run[] {
  const plain = line
    .replace(/^\s*\\\s*/, "")
    .replace(/\[\[\s*([^\]|]+?)\s*(\|[^\]]*)?\]\]/g, "$1")
    .replace(/~([^~]+)~/g, "$1")
    .replace(/\s*\|\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  const runs: Run[] = [];
  const re = /`([^`]+)`|\*\*(?=\S)(.+?)(?<=\S)\*\*|\*([^*]+)\*/g;
  let at = 0;
  for (const m of plain.matchAll(re)) {
    if (m.index! > at) runs.push({ text: plain.slice(at, m.index) });
    if (m[1] !== undefined) runs.push({ text: m[1], code: true });
    else if (m[2] !== undefined) runs.push(...runsOf(m[2]).map((r) => ({ ...r, bold: true })));
    else runs.push({ text: m[3], italic: true });
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
    const bullet = line.match(/^[-*]\s+/);
    const runs = runsOf(bullet ? line.slice(bullet[0].length) : line);
    if (runs.length) out.push({ kind: "para", runs, ...(bullet ? { bullet: true } : {}) });
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
