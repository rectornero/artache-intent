import { describe, expect, it } from "vitest";
import { choicesIn, choose, guessLevel, passages, readLevels, storyOnly, toWrite, writeLevels, LEVELS_FILE } from "../src/core/levels.ts";

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
  it("guesses each line by rules", () => {
    expect(guessLevel("cats, very peaceful sky, then the important dialogue")).toBe("intent");
    expect(guessLevel("Tony and Limo argue about the alibi; Limo wins")).toBe("intent");
    expect(guessLevel("they argue. Limo wins.")).toBe("intent");
    expect(guessLevel("Tony opens the door. It's raining.")).toBe("written");
    expect(guessLevel(`Sam, smiling: "Yes!"`)).toBe("written");
    expect(guessLevel("«Ciao» dice lei")).toBe("written");
    expect(guessLevel("— Ciao, dice lei.")).toBe("written");
    expect(guessLevel("Claude, make Tony angrier here")).toBe("request");
    expect(guessLevel("Voglio un minigame sulla paura")).toBe("request");
  });
  it("tells intent from finished text", () => {
    const cases: [string, string][] = [
      ["Museum, cats, peaceful sky", "intent"],
      ["Rain. Door. Silence.", "intent"],
      ["storia di alice confronta appunti dramma periodo buio flashback bianco e nero", "intent"],
      ["dark period, black and white flashback", "intent"],
      ["they argue about the alibi and limo wins", "intent"],
      ["Tony finds the key, then the lights go out", "intent"],
      ["Juu explains the plan (about 200 words)", "intent"],
      ["She looks at the sea → decides to stay.", "intent"],
      ["He nods.", "written"],
      ["Now an Investigation minigame gets triggered.", "written"],
      ["The sky over the museum was so calm that neither of them spoke for a while.", "written"],
      ["Il cielo sopra il museo era così calmo che nessuno dei due parlò.", "written"],
      ["Can you make this scene sadder?", "request"],
      ["/ make the minigame scarier", "request"],
      ["/scarier", "request"],
    ];
    for (const [line, level] of cases) expect([line, guessLevel(line)]).toEqual([line, level]);
  });
  it("reads the whole note with no paragraphs or markers needed", () => {
    const ps = passages(note);
    expect(ps.map((p) => [p.level, p.lines.length])).toEqual([["intent", 1], ["written", 3], ["intent", 1], ["request", 2], ["written", 1]]);
    expect(note.slice(ps[1].from, ps[1].to)).toMatch(/^Alex: "Listen[\s\S]*Jamie too\."$/);
  });
  it("skips headings, comments and dividers", () => {
    const ps = passages(`# Chapter 1\n// a comment\n---\nrain, door`);
    expect(ps.map((p) => p.lines)).toEqual([["rain, door"]]);
  });
  it("reads \\ as intent and / as a request", () => {
    expect(passages("\\ The door. Rain.\n/ scarier").map((p) => p.level)).toEqual(["intent", "request"]);
  });
  it("leaves out lines the writer chose to keep as written", () => {
    const text = "Rain falls.\nHe nods.";
    expect(toWrite(passages(text, choose([], text, 0, { level: "written" }))).story.map((p) => p.lines)).toEqual([["He nods."]]);
  });
  it("keeps the writer's choice with the line, and finds it again after outside edits", () => {
    const text = "rain, door\nthey argue. Limo wins.";
    const choices = choose([], text, 15, { level: "written" });
    expect(choices).toEqual([{ from: 11, to: 33, level: "written" }]);
    expect(passages(text, choices).map((p) => [p.level, p.chosen])).toEqual([["intent", false], ["written", true]]);
    const files = { [LEVELS_FILE]: writeLevels({}, "a.draft", text, choices)! };
    const edited = "New line.\n" + text;
    expect(passages(edited, choicesIn(edited, readLevels(files)["a.draft"])).at(-1)).toMatchObject({ level: "written", chosen: true });
    expect(choose(choices, text, 11, { level: null })).toEqual([]);
  });
  it("leaves requests out of the story", () => {
    expect(storyOnly("Rain falls.\n/ make it colder\nHe nods.")).toBe("Rain falls.\nHe nods.");
  });
  it("marks requests done and leaves them out of ✦ Unfold", () => {
    const text = "/ more rain\nrain, door";
    const ps = passages(text, choose([], text, 0, { done: true }));
    expect(ps[0]).toMatchObject({ level: "request", done: true, chosen: false });
    const w = toWrite(ps);
    expect([w.open, w.asks.length]).toEqual([1, 0]);
  });
});

import { applyUnfold, planUnfold } from "../src/core/unfold.ts";

describe("✦ Unfold", () => {
  const text = `rain, door\nTony opens the door.\n» make it colder »\nthey argue. Limo wins.`;
  it("marks every passage with its level and every open request", () => {
    const plan = planUnfold(text);
    expect(plan.units.map((u) => [u.level, u.note])).toEqual([["intent", "rain, door"], ["written", "Tony opens the door."], ["intent", "they argue. Limo wins."]]);
    expect(plan.open).toBe(3);
    expect(plan.asks.map((a) => a.lines)).toEqual([["» make it colder »"]]);
    expect(plan.marked).toBe(`<part n="1" level="intent">rain, door</part>\n<part n="2" level="written">Tony opens the door.</part>\n<request n="1">» make it colder »</request>\n<part n="3" level="intent">they argue. Limo wins.</part>`);
  });
  it("puts Claude's text in place, keeps requests, and leaves unchanged parts the writer's", () => {
    const plan = planUnfold(text);
    const r = applyUnfold(text, plan.units, ["Rain hammers the door.", "Tony opens the door.", "They argue, and Limo wins."]);
    expect(r.text).toBe(`Rain hammers the door.\nTony opens the door.\n» make it colder »\nThey argue, and Limo wins.`);
    expect(r.written.map((w) => r.text.slice(w.from, w.to))).toEqual(["Rain hammers the door.", "They argue, and Limo wins."]);
  });
});
