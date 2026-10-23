import { describe, expect, it } from "vitest";
import { countWords, playWords, projectWords, readGoals, writeGoals } from "../src/core/words.ts";
import { compileProject } from "../src/project.ts";

describe("word count", () => {
  it("counts prose, not headings, comments or notes for Claude", () => {
    expect(countWords("# Chapter one\n## The stairs\nTony's keys don't jingle. {{ Juu answers, 200 words }}\n// a note\nShe waits — twenty-six steps.")).toBe(8);
    expect(countWords("")).toBe(0);
    expect(countWords("[BG stairwell day]\n>> MINIGAME: Lockpick\n+ met: TONY\n@talk Le\nTODO: later\nTwo words.")).toBe(2);
  });

  it("counts what is said and narrated in Play, not directions", () => {
    const r = compileProject({}, { "a.intent": "## S\n[BG hall]\nTONY: Two words.\nThe door creaks open.\n? Stay or go\n> Stay\n    I stay here.\n" }, ["renpy"]);
    expect(playWords(r.scripts[0])).toBe(2 + 4 + 3 + 1 + 3);
  });

  it("uses each script's Draft when there is one", () => {
    const r = compileProject({}, { "a.intent": "## S\nTONY: One two three.\n", "b.intent": "## S\nTONY: Four.\n" }, ["renpy"]);
    expect(projectWords({ "a.draft": "Ten words would be too many here, so just six." }, r.scripts)).toBe(10 + 1);
  });

  it("keeps goals in intent.json", () => {
    const json = writeGoals('{"title":"x"}', { words: 80000, daily: 500 });
    expect(JSON.parse(json)).toEqual({ title: "x", goals: { words: 80000, daily: 500 } });
    expect(readGoals(json)).toEqual({ words: 80000, daily: 500 });
    expect(JSON.parse(writeGoals(json, {}))).toEqual({ title: "x" });
    expect(readGoals("not json")).toEqual({});
  });
});
