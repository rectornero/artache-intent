import { describe, expect, it } from "vitest";
import { choicesIn, choose, taggedLevel, passages, readLevels, storyOnly, toWrite, writeLevels, LEVELS_FILE } from "../src/core/levels.ts";

// Nero's note, the way it was first written down.
const note = `day out with sam, we laugh, we walk together, we talk about ai on the way to the museum, cats, very peaceful sky, then the important dialogue
—
Alex: "Listen... do you think you and I will have a place in this world?"
Sam, smiling: "Yes... I have a lot of hope!"
Alex: "I trust you... I should have that time with Jamie too."

jamie's story, compare notes, drama, dark period, black and white flashback
—

» Minigame: facing my fears
I want to build a minigame where Alex faces the memory of Jamie, and still carries the pain he lived through. »
Tony opens the door. It's raining.`;

describe("intent writing levels", () => {
  it("guesses nothing: a line is Written unless the writer tags it", () => {
    const cases: [string, string][] = [
      ["museum, cats, peaceful sky", "written"],
      ["they argue. Limo wins.", "written"],
      ["Can you make this scene sadder?", "written"],
      ["Claude, make Tony angrier here", "written"],
      ["\\ museum, cats, peaceful sky", "intent"],
      ["/ make the minigame scarier", "request"],
      ["/scarier", "request"],
      ["» a request", "request"],
    ];
    for (const [line, level] of cases) expect([line, taggedLevel(line)]).toEqual([line, level]);
  });
  it("reads a whole note by its tags only", () => {
    const ps = passages(note);
    expect(ps.map((p) => [p.level, p.lines.length])).toEqual([["written", 1], ["written", 3], ["written", 1], ["request", 2], ["written", 1]]);
  });
  it("skips headings, comments and dividers", () => {
    const ps = passages(`# Chapter 1\n// a comment\n---\nrain, door`);
    expect(ps.map((p) => p.lines)).toEqual([["rain, door"]]);
  });
  it("reads \\ as intent and / as a request", () => {
    expect(passages("\\ The door. Rain.\n/ scarier").map((p) => p.level)).toEqual(["intent", "request"]);
  });
  it("unfolds only what the writer marked as intent", () => {
    const text = "Rain falls.\nrain, door";
    expect(toWrite(passages(text)).story).toEqual([]);
    expect(toWrite(passages(text, choose([], text, 12, { level: "intent" }))).story.map((p) => p.lines)).toEqual([["rain, door"]]);
  });
  it("keeps the writer's choice with the line, and finds it again after outside edits", () => {
    const text = "Rain falls.\nthey argue. Limo wins.";
    const choices = choose([], text, 15, { level: "intent" });
    expect(choices).toEqual([{ from: 12, to: 34, level: "intent" }]);
    expect(passages(text, choices).map((p) => [p.level, p.chosen])).toEqual([["written", false], ["intent", true]]);
    const files = { [LEVELS_FILE]: writeLevels({}, "a.draft", text, choices)! };
    const edited = "New line.\n" + text;
    expect(passages(edited, choicesIn(edited, readLevels(files)["a.draft"])).at(-1)).toMatchObject({ level: "intent", chosen: true });
    expect(choose(choices, text, 12, { level: null })).toEqual([]);
  });
  it("leaves requests out of the story", () => {
    expect(storyOnly("Rain falls.\n/ make it colder\nHe nods.")).toBe("Rain falls.\nHe nods.");
  });
  it("marks requests done and leaves them out of ✦ Unfold", () => {
    const text = "/ more rain\n\\ rain, door";
    const ps = passages(text, choose([], text, 0, { done: true }));
    expect(ps[0]).toMatchObject({ level: "request", done: true, chosen: false });
    const w = toWrite(ps);
    expect([w.open, w.asks.length]).toEqual([1, 0]);
  });
});

import { applyUnfold, planUnfold } from "../src/core/unfold.ts";

describe("✦ Unfold", () => {
  const text = `\\ rain, door\nTony opens the door.\n» make it colder »\n\\ they argue. Limo wins.`;
  it("marks every intent passage and every open request, and leaves written text as it is", () => {
    const plan = planUnfold(text);
    expect(plan.units.map((u) => u.note)).toEqual(["\\ rain, door", "\\ they argue. Limo wins."]);
    expect(plan.open).toBe(3);
    expect(plan.asks.map((a) => a.lines)).toEqual([["» make it colder »"]]);
    expect(plan.marked).toBe(`<part n="1">\\ rain, door</part>\nTony opens the door.\n<request n="1">» make it colder »</request>\n<part n="2">\\ they argue. Limo wins.</part>`);
  });
  it("puts Claude's text in place, keeps requests, and leaves unchanged parts the writer's", () => {
    const plan = planUnfold(text);
    const r = applyUnfold(text, plan.units, ["Rain hammers the door.", "They argue, and Limo wins."]);
    expect(r.text).toBe(`Rain hammers the door.\nTony opens the door.\n» make it colder »\nThey argue, and Limo wins.`);
    expect(r.written.map((w) => r.text.slice(w.from, w.to))).toEqual(["Rain hammers the door.", "They argue, and Limo wins."]);
  });
});
