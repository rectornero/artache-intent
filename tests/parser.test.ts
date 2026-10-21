import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/core/config.ts";
import { parseScript } from "../src/core/parser.ts";
import type { Node } from "../src/core/ast.ts";

const limout = loadConfig({
  narrator: "MIRIAM",
  voiceAs: true,
  voices: { hollow: "HOLLOW" },
  doubleBrackets: "stain",
  cast: { MIRIAM: { id: "m", aliases: ["M"] }, FREE: { id: "f", aliases: ["F"] }, HOLLOW: { id: "mv" } },
});
const quest = loadConfig({ narrator: null, doubleBrackets: "link" });

const body = (src: string, cfg = limout): Node[] => parseScript(src, cfg).chapters[0].scenes[0].body;

describe("lines", () => {
  it("plain lines are spoken by the project's narrator", () => {
    expect(body("The chair is empty.")[0]).toMatchObject({ n: "say", speaker: "MIRIAM" });
    expect(body("The chair is empty.", quest)[0]).toMatchObject({ n: "say", speaker: null });
  });

  it("reads dialogue, voice-as shortcuts and voices", () => {
    const [a, b, c, d] = body("FREE: Go back.\nM(F): The fifth floor.\n(as FREE) Weight on the right foot.\n(hollow) One, two.");
    expect(a).toMatchObject({ speaker: "FREE" });
    expect(b).toMatchObject({ speaker: "MIRIAM", as: "FREE" });
    expect(c).toMatchObject({ speaker: "MIRIAM", as: "FREE" });
    expect(d).toMatchObject({ speaker: "HOLLOW" });
  });

  it("treats a colon in narration as narration", () => {
    expect(body("I think: he knows.")[0]).toMatchObject({ speaker: "MIRIAM" });
  });

  it("flags new all-caps speakers instead of guessing", () => {
    const s = parseScript("KELSEY: Hi.", limout);
    expect(s.newSpeakers).toEqual(["KELSEY"]);
    expect(s.diagnostics.some((d) => d.message.includes("KELSEY"))).toBe(true);
  });

  it("continues the last speaker with a dash", () => {
    expect(body("FREE: One.\n- Two.")[1]).toMatchObject({ speaker: "FREE" });
  });

  it("keeps moods for Quest Script portraits", () => {
    const s = parseScript("@npc Lena\n\n## Morning\nLena (smile): Hi!", quest);
    expect(s.chapters[0].scenes[0].body[0]).toMatchObject({ speaker: "Lena", mood: "smile" });
  });
});

describe("inline", () => {
  it("stains in LimOut, links in Quest Script", () => {
    const [stain] = body("FREE: At [[half past twelve | Too smooth.]]");
    expect(stain.n === "say" && stain.text[1]).toMatchObject({ t: "stain", word: "half past twelve", guess: "Too smooth." });
    const [link] = body("Go to [[Route 1]].", quest);
    expect(link.n === "say" && link.text[1]).toMatchObject({ t: "link", target: "Route 1" });
  });

  it("italics, slow text and beats", () => {
    const [s] = body("*Only* ~one~ | two");
    expect(s.n === "say" && s.text.map((p) => p.t)).toEqual(["italic", "text", "slow", "text", "beat", "text"]);
  });
});

describe("stage and memory", () => {
  it("parses stage directions, several per line", () => {
    const nodes = body("[BG stairwell day, fade]  [MUSIC marble]  [F scared, right]");
    expect(nodes.map((n) => n.n === "cmd" && n.cmd)).toEqual([
      { c: "bg", name: "stairwell", tint: "day", transition: "fade" },
      { c: "music", name: "marble" },
      { c: "sprite", who: "FREE", expression: "scared", position: "right", move: { k: "show" }, mods: [] },
    ]);
  });

  it("parses entrances, exits, short positions and modifiers", () => {
    const cmds = body("[F neutral, in R]\n[F to CL]\n[F CL, back]\n[F leaves fast]\n[MIRIAM copying FREE]").map((n) => n.n === "cmd" && n.cmd);
    expect(cmds[0]).toMatchObject({ move: { k: "enter", from: "right" }, expression: "neutral" });
    expect(cmds[1]).toMatchObject({ move: { k: "move", to: "center left" } });
    expect(cmds[2]).toMatchObject({ position: "center left", mods: ["back"] });
    expect(cmds[3]).toMatchObject({ move: { k: "exit", fast: true } });
    expect(cmds[4]).toMatchObject({ who: "MIRIAM", copying: "FREE" });
  });

  it("keeps unknown brackets as free descriptions", () => {
    const s = parseScript("[Free comes down slowly]", limout);
    expect(s.chapters[0].scenes[0].body[0]).toMatchObject({ cmd: { c: "describe" } });
  });

  it("memory lines and Quest Script actions", () => {
    const cmds = body("+ evidence: glasses\n+ flag: followed\n! give Crisp Bread x2\n! trust Lena +5\n! step 2000").map((n) => n.n === "cmd" && n.cmd);
    expect(cmds).toEqual([
      { c: "memory", key: "evidence", value: "glasses" },
      { c: "switch", name: "followed", on: true },
      { c: "item", name: "Crisp Bread", delta: 2 },
      { c: "var", name: "Trust: Lena", op: "add", value: 5 },
      { c: "var", name: "Story Step", op: "set", value: 2000 },
    ]);
  });
});

describe("flow", () => {
  it("LimOut choices: ? prompt then > options", () => {
    const [menu] = body("? Follow?\n> Yes (+ flag: followed)\n    I go.\n> No\n    I stay.");
    expect(menu).toMatchObject({ n: "menu", options: [{ text: "Yes", effects: [{ c: "switch", name: "followed" }] }, { text: "No" }] });
  });

  it("Quest Script choices: consecutive ? options", () => {
    const [menu] = body("? Take it\n  ! give Bread\n? Leave\n  Bye.", quest);
    expect(menu.n === "menu" && menu.options.map((o) => o.text)).toEqual(["Take it", "Leave"]);
    expect(menu.n === "menu" && menu.prompt).toBeUndefined();
  });

  it("IF ... ELSE ... END", () => {
    const [n] = body("IF followed\n    Up.\nELSE\n    Down.\nEND");
    expect(n).toMatchObject({ n: "if", branches: [{ cond: { k: "flag", name: "followed" } }, { cond: null }] });
  });

  it(">> blocks keep their items", () => {
    const [n] = body(">> MIND: TONY\n  sign: Watch.\n  sign (false): Shoes.\n  * Glasses (important)\n      Intact.");
    expect(n).toMatchObject({ n: "custom", type: "MIND", header: "TONY" });
    if (n.n !== "custom") throw new Error();
    expect(n.items[1]).toMatchObject({ key: "sign", mods: ["false"], value: "Shoes." });
    expect(n.items[2].body[0]).toMatchObject({ n: "say" });
  });

  it("chapters and scenes", () => {
    const s = parseScript("# CHAPTER 6 · The Pub\n## Outside, evening\nHi.\n## Inside\nHo.", limout);
    expect(s.chapters[0].id).toBe("chapter_6");
    expect(s.chapters[0].scenes.map((x) => x.id)).toEqual(["chapter_6_outside_evening", "chapter_6_inside"]);
  });
});

describe("shortcuts", () => {
  it("aliases replace whole words outside narration only", () => {
    const s = parseScript("@alias st = stairwell\n[BG st]\nThe st is dark.", limout);
    const [bg, line] = s.chapters[0].scenes[0].body;
    expect(bg).toMatchObject({ cmd: { name: "stairwell" } });
    expect(line.n === "say" && line.text[0]).toMatchObject({ v: "The st is dark." });
  });

  it("reserved words can't be aliases", () => {
    expect(parseScript("@alias BG = x", limout).diagnostics[0].level).toBe("error");
  });

  it("macros expand where they are called", () => {
    const b = body("@macro arrive\n[BG hall]\n+ met: FREE\n@end\n@arrive");
    expect(b.map((n) => n.n === "cmd" && n.cmd.c)).toEqual(["bg", "memory"]);
  });

  it("strips // notes", () => {
    expect(body("// hidden\nF: Go. // trailing")).toEqual([expect.objectContaining({ speaker: "FREE" })]);
  });
});

describe("Quest Script blocks", () => {
  it("talks, events, aliases from aka", () => {
    const s = parseScript(
      "@npc Lena aka Le\n@talk Le when: step 1000\n  Le: Hi.\n@event Oak\n  at: [[R1]] (14,9)\n  when: has axe\n    ! erase",
      quest,
    );
    const talk = s.blocks.find((b) => b.kind === "talk")!;
    expect(talk.name).toBe("Lena");
    expect(talk.when).toEqual({ k: "step", n: 1000, orMore: false });
    expect(talk.body![0]).toMatchObject({ speaker: "Lena" });
    const ev = s.blocks.find((b) => b.kind === "event")!;
    expect(ev.fields.at).toBe("[[R1]] (14,9)");
    expect(ev.branches![0].cond).toEqual({ k: "has", item: "axe" });
  });
});
