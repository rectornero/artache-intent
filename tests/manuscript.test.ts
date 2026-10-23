import { describe, expect, it } from "vitest";
import { docx, docxParts } from "../src/core/docx.ts";
import { draftBlocks, manuscript, manuscriptWords, runsOf } from "../src/core/manuscript.ts";
import { manuscriptPdf } from "../app/manuscriptPdf.ts";

const draft = `# Chapter 1 · The Stairwell
## The body
// a note to self
[BG stairwell]
Behind me someone breathes. {{ Juu reacts, 100 words }}
“You took your *time*,” Tony says.
## The landing
>> MINIGAME: Lockpick
The landing smells of bleach.
`;
const opts = { title: "Liminal Outliers", author: "Nero Rector", sceneTitles: false, paper: "a4" as const };

describe("manuscript", () => {
  it("keeps prose, chapters and scene breaks, and drops script lines and notes", () => {
    expect(draftBlocks(draft, false)).toEqual([
      { kind: "chapter", title: "Chapter 1 · The Stairwell" },
      { kind: "para", runs: [{ text: "Behind me someone breathes." }] },
      { kind: "para", runs: [{ text: "“You took your " }, { text: "time", italic: true }, { text: ",” Tony says." }] },
      { kind: "break" },
      { kind: "para", runs: [{ text: "The landing smells of bleach." }] },
    ]);
    expect(draftBlocks(draft, true).filter((b) => b.kind === "scene").map((b) => b.kind === "scene" && b.title)).toEqual(["The body", "The landing"]);
  });

  it("turns Intent's inline marks into plain text", () => {
    expect(runsOf("~Slowly~ | he [[turns | looks]] away")).toEqual([{ text: "Slowly he turns away" }]);
  });

  it("keeps the writer's formatting", () => {
    expect(runsOf("A **bold *and* brave** step and `a note`")).toEqual([
      { text: "A " }, { text: "bold ", bold: true }, { text: "and", italic: true, bold: true }, { text: " brave", bold: true }, { text: " step and " }, { text: "a note", code: true },
    ]);
    expect(runsOf("\\ rain, door, *silence*")).toEqual([{ text: "rain, door, " }, { text: "silence", italic: true }]);
    expect(draftBlocks("- first\n- *second*", false)).toEqual([{ kind: "para", runs: [{ text: "first" }], bullet: true }, { kind: "para", runs: [{ text: "second", italic: true }], bullet: true }]);
  });

  it("counts the manuscript's words", () => {
    expect(manuscriptWords(manuscript([draft], opts))).toBe(4 + 6 + 5);
  });

  it("writes a Word document with styles, a header and the text", async () => {
    const blocks = manuscript([draft], opts);
    const parts = docxParts(blocks, opts, 15);
    expect(Object.keys(parts)).toContain("word/header1.xml");
    expect(parts["word/document.xml"]).toContain('<w:pStyle w:val="Heading1"/><w:pageBreakBefore/>');
    expect(parts["word/document.xml"]).toContain("<w:i/></w:rPr><w:t xml:space=\"preserve\">time</w:t>");
    expect(parts["word/document.xml"]).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
    expect(parts["word/header1.xml"]).toContain("Rector / Liminal Outliers / ");
    const file = await docx(blocks, opts, 15);
    expect([...file.slice(0, 2)]).toEqual([0x50, 0x4b]); // a zip
  });

  it("writes a PDF", async () => {
    const pdf = await manuscriptPdf(manuscript([draft], opts), opts, 15);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  });
});
