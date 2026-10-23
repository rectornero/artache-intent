import { describe, expect, it } from "vitest";
import { fillGapsAt, retireNotes } from "../src/core/fill.ts";
import { claudeSpans, subtract, writeAuthors, readAuthors } from "../src/core/authors.ts";

describe("old {{ notes }}", () => {
  it("become intent lines of their own, across lines and mid-paragraph", () => {
    const draft = `Tony opens the door.\n\n{{ Tony and Limo argue about the alibi;\nLimo wins }}\n\n“Fine,” Tony says. {{ he leaves }} The end. {{   }}`;
    expect(retireNotes(draft)).toBe(`Tony opens the door.\n\n\\ Tony and Limo argue about the alibi; Limo wins\n\n“Fine,” Tony says.\n\\ he leaves\nThe end.`);
  });
  it("leave a Draft without notes alone", () => {
    expect(retireNotes("Rain.  \nDoor.")).toBe("Rain.  \nDoor.");
  });
});

describe("who wrote what", () => {
  it("knows where the written parts landed, and moves later offsets", () => {
    const text = "A {{x}} B {{y}} C";
    const r = fillGapsAt(text, [{ from: 2, to: 7, note: "x" }, { from: 10, to: 15, note: "y" }], ["one", "two words"]);
    expect(r.text).toBe("A one B two words C");
    expect(r.written.map((w) => r.text.slice(w.from, w.to))).toEqual(["one", "two words"]);
    expect(r.text.slice(r.map(16))).toBe("C");
  });
  it("keeps what stood there when a fill is empty", () => {
    expect(fillGapsAt("A x B", [{ from: 2, to: 3, note: "x" }], [""]).text).toBe("A x B");
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
