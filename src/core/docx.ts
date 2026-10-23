// A Word document from manuscript blocks, in standard manuscript format:
// Times New Roman 12 pt, double-spaced, one-inch margins, first-line indents,
// each chapter on a new page, and a title page with the word count.

import type { Block, ManuscriptOptions, Run } from "./manuscript.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const run = (r: Run) => `<w:r>${r.italic ? "<w:rPr><w:i/></w:rPr>" : ""}<w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`;
const para = (style: string, body: string, extra = "") => `<w:p><w:pPr><w:pStyle w:val="${style}"/>${extra}</w:pPr>${body}</w:p>`;

export function docxParts(blocks: Block[], opts: ManuscriptOptions, words: number): Record<string, string> {
  const rounded = words < 1000 ? words : Math.round(words / 100) * 100;
  const body = [
    para("Contact", run({ text: opts.author || " " })),
    para("Contact", run({ text: `About ${rounded.toLocaleString("en-US")} words` })),
    para("Title", run({ text: opts.title || "Untitled" })),
    ...(opts.author ? [para("Byline", run({ text: `by ${opts.author}` }))] : []),
  ];
  // The story starts on its own page; a chapter starts one anyway.
  if (blocks[0] && blocks[0].kind !== "chapter") body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
  let afterHeading = true;
  for (const b of blocks) {
    if (b.kind === "chapter") {
      body.push(para("Heading1", run({ text: b.title }), "<w:pageBreakBefore/>"));
      afterHeading = true;
    } else if (b.kind === "scene") {
      body.push(para("Heading2", run({ text: b.title })));
      afterHeading = true;
    } else if (b.kind === "break") {
      body.push(para("SceneBreak", run({ text: "#" })));
      afterHeading = true;
    } else {
      body.push(para(afterHeading ? "FirstPara" : "Body", b.runs.map(run).join("")));
      afterHeading = false;
    }
  }
  body.push(para("SceneBreak", run({ text: "END" })));

  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const header = opts.author || opts.title
    ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}><w:p><w:pPr><w:jc w:val="right"/></w:pPr>${run({ text: `${[opts.author.split(" ").pop(), opts.title].filter(Boolean).join(" / ")} / ` })}<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:hdr>`
    : null;
  const style = (id: string, name: string, ppr: string, rpr = "", basedOn = "Normal") =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="${basedOn}"/><w:pPr>${ppr}</w:pPr>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}</w:style>`;
  return {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${header ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ""}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    "docProps/core.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(opts.title)}</dc:title><dc:creator>${esc(opts.author)}</dc:creator></cp:coreProperties>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${header ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' : ""}</Relationships>`,
    ...(header ? { "word/header1.xml": header } : {}),
    "word/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="480" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
      + `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>`
      + style("Body", "Body Text", '<w:ind w:firstLine="720"/>')
      + style("FirstPara", "First Paragraph", "")
      + style("Heading1", "heading 1", '<w:keepNext/><w:spacing w:before="2880" w:after="480"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/>', "<w:b/>")
      + style("Heading2", "heading 2", '<w:keepNext/><w:spacing w:before="240"/><w:jc w:val="center"/><w:outlineLvl w:val="1"/>', "<w:i/>")
      + style("SceneBreak", "Scene Break", '<w:jc w:val="center"/>')
      + style("Title", "Title", '<w:spacing w:before="4320"/><w:jc w:val="center"/>', '<w:b/><w:sz w:val="32"/>')
      + style("Byline", "Byline", '<w:jc w:val="center"/>')
      + style("Contact", "Contact", '<w:spacing w:line="240" w:lineRule="auto"/>')
      + `</w:styles>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body.join("")}<w:sectPr>${header ? '<w:headerReference w:type="default" r:id="rId2"/>' : ""}${opts.paper === "a4" ? '<w:pgSz w:w="11906" w:h="16838"/>' : '<w:pgSz w:w="12240" w:h="15840"/>'}<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/><w:titlePg/></w:sectPr></w:body></w:document>`,
  };
}

/** The .docx file itself. */
export async function docx(blocks: Block[], opts: ManuscriptOptions, words: number): Promise<Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const [name, text] of Object.entries(docxParts(blocks, opts, words))) zip.file(name, text);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}
