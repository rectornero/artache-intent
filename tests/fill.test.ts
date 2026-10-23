import { describe, expect, it } from "vitest";
import { fillGaps, findGaps, markGaps } from "../src/core/fill.ts";

const draft = `Tony opens the door.\n\n{{ Tony and Limo argue about the alibi;\nLimo wins }}\n\n“Fine,” Tony says. {{ he leaves }} The end. {{   }}`;

describe("draft gaps", () => {
  it("finds notes, across lines, skipping empty braces", () => {
    expect(findGaps(draft).map((g) => g.note)).toEqual(["Tony and Limo argue about the alibi; Limo wins", "he leaves"]);
  });
  it("fills each gap and keeps the writer's text", () => {
    const gaps = findGaps(draft);
    const out = fillGaps(draft, gaps, ["“You were there,” Tony says.", "He walks out."]);
    expect(out).toBe(`Tony opens the door.\n\n“You were there,” Tony says.\n\n“Fine,” Tony says. He walks out. The end. {{   }}`);
  });
  it("keeps a note Claude left empty", () => {
    const gaps = findGaps(draft);
    expect(fillGaps(draft, gaps, ["Argument.", ""])).toContain("{{ he leaves }}");
  });
  it("numbers the gaps for Claude", () => {
    expect(markGaps(draft, findGaps(draft))).toContain(`<write n="2">he leaves</write>`);
  });
});

import { fillGapsAt } from "../src/core/fill.ts";
import { claudeSpans, subtract, writeAuthors, readAuthors } from "../src/core/authors.ts";

describe("who wrote what", () => {
  it("knows where the written parts landed, and moves later offsets", () => {
    const text = "A {{x}} B {{y}} C";
    const r = fillGapsAt(text, findGaps(text), ["one", "two words"]);
    expect(r.text).toBe("A one B two words C");
    expect(r.written.map((w) => r.text.slice(w.from, w.to))).toEqual(["one", "two words"]);
    expect(r.text.slice(r.map(16))).toBe("C");
  });
  it("finds Claude's stretches again after outside edits, and drops changed ones", () => {
    const text = "Mine. Claude's part. More mine. Another Claude part.";
    const files = { "a.draft": text };
    const json = writeAuthors(files, "a.draft", text, [{ from: 6, to: 20 }, { from: 32, to: 52 }])!;
    const stored = readAuthors({ "intent.authors.json": json })["a.draft"];
    const edited = "New start. Mine. Claude's part. More mine. Another Claude PART.";
    expect(claudeSpans(edited, stored).map((s) => edited.slice(s.from, s.to))).toEqual(["Claude's part."]);
  });
  it("hands typed text to the writer", () => {
    expect(subtract([{ from: 0, to: 10 }], 4, 6)).toEqual([{ from: 0, to: 4 }, { from: 6, to: 10 }]);
  });
});
