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
