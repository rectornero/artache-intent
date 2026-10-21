import { describe, expect, it } from "vitest";
import { issueId, locate, mergeRun, readChecks } from "../src/core/checks.ts";
import { checkJob, fenced, updateJob } from "../app/claude.ts";

const cfg = { cast: {}, assets: { bg: {}, music: {} } } as never;
const found = { file: "a.intent", line: 2, quote: "the red key", kind: "continuity" as const, severity: "high" as const, problem: "The key was lost in chapter 1.", suggestion: "Have her find it first." };

describe("story checks", () => {
  it("keeps other scripts' issues and dismissals across runs", () => {
    let c = mergeRun(readChecks({}), ["a.intent", "b.intent"], [found, { ...found, file: "b.intent" }], 1);
    c.dismissed = [issueId(found)];
    c = mergeRun(c, ["a.intent"], [found], 2);
    expect(c.issues).toHaveLength(2);
    expect(c.dismissed).toEqual([issueId(found)]);
    expect(c.checked).toEqual({ "a.intent": 2, "b.intent": 1 });
    expect(mergeRun(c, ["a.intent"], [], 3).dismissed).toEqual([]);
  });

  it("follows a quote when lines move, and notices when it's gone", () => {
    const i = { ...found, id: "x" };
    expect(locate("x\nshe takes the red key", i)).toBe(2);
    expect(locate("new\nx\nshe takes the red key", i)).toBe(3);
    expect(locate("she has no key", i)).toBeNull();
  });
});

describe("copy and paste", () => {
  it("reads the fenced block of a pasted reply", () => {
    expect(fenced("Here you go:\n```text\nLine one\nLine two\n```\nHope it helps")).toBe("Line one\nLine two");
    expect(fenced("just text")).toBe("just text");
    const job = updateJob({ from: "draft", to: "play", before: "", after: "x", target: "" }, cfg, []);
    expect(job.readPasted("```\nTONY: Hi.\n```")).toBe("TONY: Hi.\n");
  });

  it("reads pasted story check JSON and drops unknown files", () => {
    const job = checkJob({ "a.intent": "one\ntwo" }, false, cfg, []);
    const out = job.readPasted('Sure!\n```json\n{"issues": [' + JSON.stringify(found) + ',' + JSON.stringify({ ...found, file: "zzz.intent" }) + "]}\n```");
    expect(out).toHaveLength(1);
    expect(job.content).toContain("2| two");
  });
});
