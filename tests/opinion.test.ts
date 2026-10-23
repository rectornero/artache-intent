import { describe, expect, it } from "vitest";
import { lineOfQuote, opinionPart } from "../src/core/opinion.ts";

const script = ["# One", "## Stairs", "a", "b", "## Landing", "c", "# Two", "intro", "## Roof", "d"].join("\n");

describe("opinionPart", () => {
  it("takes the scene at the cursor", () => {
    expect(opinionPart(script, "scene", 4)).toMatchObject({ text: "## Stairs\na\nb", from: 2, to: 4, title: "Stairs" });
    expect(opinionPart(script, "scene", 10)).toMatchObject({ text: "## Roof\nd", title: "Roof" });
  });
  it("stops a scene at the next chapter, and doesn't reach back past its own", () => {
    expect(opinionPart(script, "scene", 6).text).toBe("## Landing\nc");
    expect(opinionPart(script, "scene", 8)).toMatchObject({ text: "intro", from: 8, to: 8, title: "" });
  });
  it("takes the chapter at the cursor", () => {
    expect(opinionPart(script, "chapter", 5)).toMatchObject({ from: 1, to: 6, title: "One" });
    expect(opinionPart(script, "chapter", 9)).toMatchObject({ from: 7, to: 10, title: "Two" });
  });
  it("takes the selection, or the whole script without one", () => {
    expect(opinionPart(script, "selection", 1, "b\n## Landing")).toMatchObject({ text: "b\n## Landing", from: 4, to: 5 });
    expect(opinionPart(script, "selection", 1, "")).toMatchObject({ scope: "script", from: 1, to: 10 });
  });
  it("works without headings", () => {
    expect(opinionPart("x\ny", "scene", 2)).toMatchObject({ text: "x\ny", from: 1, to: 2 });
  });
});

describe("lineOfQuote", () => {
  it("finds a quote, loosely", () => {
    expect(lineOfQuote(script, "“c”")).toBe(6);
    expect(lineOfQuote(script, "ROOF")).toBe(9);
    expect(lineOfQuote(script, "nowhere")).toBeNull();
  });
});
