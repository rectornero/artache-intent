import { describe, expect, it } from "vitest";
import { example } from "./helpers.ts";
import { wrap, type MvCommand, type MvCommonEvent } from "../src/exporters/mv.ts";

/** Every MV block opener must be closed at the right indent, the way the editor writes them. */
function checkMvList(list: MvCommand[]) {
  expect(list.at(-1)).toEqual({ code: 0, indent: 0, parameters: [] });
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.code === 402 || c.code === 411 || c.code === 111) {
      // the body ends with a code 0 one level deeper before the next sibling
      let j = i + 1;
      while (j < list.length && list[j].indent > c.indent) j++;
      expect(list[j - 1]).toMatchObject({ code: 0, indent: c.indent + 1 });
    }
    if (c.code === 102) expect(list.slice(i + 1).find((x) => x.indent === c.indent && x.code !== 402)?.code).toBe(404);
    if (c.code === 401) expect([101, 401]).toContain(list[i - 1].code);
  }
}

describe("LimOut chapter 1 -> Ren'Py", () => {
  const r = example("limout");
  const rpy = r.files["renpy/cap1.rpy"];

  it("matches the spec's sample conversion", () => {
    for (const line of [
      "scene cg bruno_corpo",
      "play sound sfx_respiro",
      'm "Behind me someone breathes hard through their nose."',
      "scene bg tromba_scale",
      "show free neutro at intent_enter_right(0.88)",
      '$ incontra("free")',
      'm_come_f "The fifth floor."',
      "play music palazzo",
      "show free spaventato",
      "with vpunch",
      'mv "{cps=8}One, two, three.{/cps}"',
    ])
      expect(rpy).toContain(line);
  });

  it("stores a stain's guess before its line", () => {
    expect(rpy).toMatch(/\$ intent_stains\["cap1_s1"\] = "He says it smoothly[^"]*"\n\s+t "I came in at \{a=intent_stain:cap1_s1\}/);
  });

  it("calls the project's minigame labels and skips drafts", () => {
    expect(rpy).toContain("call minigame_investigate");
    expect(rpy).toContain("call minigame_mind");
    expect(rpy).not.toContain("call intent_draft");
    expect(r.files["renpy/REPORT.md"]).toContain("Draft at line");
  });

  it("indents every Ren'Py block consistently", () => {
    const lines = rpy.split("\n");
    lines.forEach((l, i) => {
      if (l.trimEnd().endsWith(":") && !l.trim().startsWith("#")) {
        const next = lines.slice(i + 1).find((x) => x.trim());
        expect(next && next.search(/\S/) > l.search(/\S/), `line ${i + 1}: ${l}`).toBe(true);
      }
    });
  });

  it("defines voice-as characters it used", () => {
    expect(r.files["renpy/intent_defs.rpy"]).toContain('define m_come_f = Character("Miriam", color="#7fa7d9")');
  });
});

describe("ContraryQuest -> RPG Maker MV", () => {
  const r = example("contraryquest");
  const ces: MvCommonEvent[] = JSON.parse(r.files["mv/CommonEvents.intent.json"]);

  it("writes well-formed event lists", () => {
    for (const ce of ces) checkMvList(ce.list);
  });

  it("puts the newest talk first and the default last", () => {
    const talk = ces.find((c) => c.name === "Talk: Lena")!;
    expect(talk.list[0]).toMatchObject({ code: 111, parameters: [1, 1, 0, 1000, 0] });
    expect(talk.list.find((c) => c.code === 411)).toBeTruthy();
  });

  it("uses known item ids and falls back to names", () => {
    const all = ces.flatMap((c) => c.list);
    expect(all).toContainEqual({ code: 126, indent: 2, parameters: [7, 0, 0, 1] });
    expect(JSON.stringify(all)).toContain('i.name===\\"Oak Log\\"');
  });

  it("names every switch and variable it allocates", () => {
    const sys = JSON.parse(r.files["mv/System.intent.json"]);
    expect(Object.values(sys.variables)).toEqual(expect.arrayContaining(["Story Step", "Trust: Lena", "Quest: MQ-01"]));
  });

  it("places map events from their tile", () => {
    const [ev] = JSON.parse(r.files["mv/MapEvents.intent.json"]);
    expect(ev).toMatchObject({ name: "Fallen Oak", x: 14, y: 9 });
    expect(ev.pages[0].list[0].code).toBe(117);
  });

  it("applies @edit to the story bible", () => {
    const bible = JSON.parse(r.files["bible.json"]);
    expect(bible.npc.Lena.fields.trust).toBe("40");
    expect(bible.quest["The Broken Bridge"].fields.reward).toBeUndefined();
    expect(bible.quest["The Broken Bridge"].fields.steps).toContain("3. Show the logs to Lena");
  });

  it("also exports the LimOut chapter to MV, and ConQue to Ren'Py", () => {
    const lim = example("limout");
    for (const ce of JSON.parse(lim.files["mv/CommonEvents.intent.json"]) as MvCommonEvent[]) checkMvList(ce.list);
    expect(r.files["renpy/prologue.rpy"]).toContain("label talk_lena:");
  });
});

describe("MV text wrapping", () => {
  it("wraps at the line width, ignoring escape codes", () => {
    expect(wrap("\\n<Lena>aaa bbb ccc", 7)).toEqual(["\\n<Lena>aaa bbb", "ccc"]);
  });
});
