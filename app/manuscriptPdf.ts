// The manuscript as a PDF, laid out like the Word file: Times 12 pt, double-spaced,
// one-inch margins, first-line indents, chapters on new pages, a running header.
// jsPDF loads only when a PDF is made.

import type { Block, ManuscriptOptions, Run } from "../src/core/manuscript.ts";

export async function manuscriptPdf(blocks: Block[], opts: ManuscriptOptions, words: number): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: opts.paper, compress: true });
  doc.setProperties({ title: opts.title, author: opts.author, creator: "Artache Intent" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 72, LEAD = 24, INDENT = 36, SIZE = 12;
  const right = W - M;
  let y = M;
  let page = 1;
  const font = (italic = false, bold = false) => doc.setFont("times", bold ? "bold" : italic ? "italic" : "normal").setFontSize(SIZE);
  const headerText = `${[opts.author.split(" ").pop(), opts.title].filter(Boolean).join(" / ")} / `;

  const newPage = () => {
    doc.addPage();
    page++;
    font();
    doc.text(`${headerText}${page}`, right, M / 2 + 6, { align: "right" });
    y = M;
  };
  const room = (h: number) => {
    if (y + h > H - M) newPage();
  };
  const centred = (text: string, italic = false, bold = false) => {
    font(italic, bold);
    for (const line of doc.splitTextToSize(text, right - M) as string[]) {
      room(LEAD);
      doc.text(line, W / 2, y + SIZE, { align: "center" });
      y += LEAD;
    }
  };
  // A paragraph of mixed roman and italic runs, wrapped word by word.
  const paragraph = (runs: Run[], indent: number) => {
    const words = runs.flatMap((r) => r.text.split(/(\s+)/).filter(Boolean).map((t) => ({ t, italic: !!r.italic })));
    let line: typeof words = [];
    let width = indent;
    let x0 = M + indent;
    const flush = () => {
      room(LEAD);
      let x = x0;
      for (const w of line) {
        font(w.italic);
        doc.text(w.t, x, y + SIZE);
        x += doc.getTextWidth(w.t);
      }
      y += LEAD;
      line = [];
      width = 0;
      x0 = M;
    };
    for (const w of words) {
      font(w.italic);
      const wd = doc.getTextWidth(w.t);
      if (/^\s+$/.test(w.t)) {
        if (line.length) line.push(w), (width += wd);
        continue;
      }
      if (width + wd > right - M && line.length) {
        while (line.length && /^\s+$/.test(line[line.length - 1].t)) line.pop();
        flush();
      }
      line.push(w);
      width += wd;
    }
    if (line.length) flush();
  };

  // Title page.
  font();
  const rounded = words < 1000 ? words : Math.round(words / 100) * 100;
  if (opts.author) doc.text(opts.author, M, M + SIZE);
  doc.text(`About ${rounded.toLocaleString("en-US")} words`, right, M + SIZE, { align: "right" });
  y = H / 3;
  font(false, true);
  doc.setFontSize(16).text(opts.title || "Untitled", W / 2, y, { align: "center" });
  y += LEAD * 1.5;
  if (opts.author) {
    font();
    doc.text(`by ${opts.author}`, W / 2, y, { align: "center" });
  }

  if (blocks[0]?.kind !== "chapter") newPage();
  let afterHeading = true;
  for (const b of blocks) {
    if (b.kind === "chapter") {
      newPage();
      y = H / 3 - LEAD;
      centred(b.title, false, true);
      y += LEAD;
      afterHeading = true;
    } else if (b.kind === "scene") {
      room(LEAD * 3);
      y += LEAD / 2;
      centred(b.title, true);
      afterHeading = true;
    } else if (b.kind === "break") {
      centred("#");
      afterHeading = true;
    } else {
      paragraph(b.runs, afterHeading ? 0 : INDENT);
      afterHeading = false;
    }
  }
  centred("END");
  return new Uint8Array(doc.output("arraybuffer"));
}
