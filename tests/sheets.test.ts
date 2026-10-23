import { describe, expect, it } from "vitest";
import { clueBoard } from "../src/core/mystery.ts";
import { detectMinigames, newSheet, parseSheet, serializeSheet, sheetFileName, sheetUsage } from "../src/core/sheets.ts";
import { compileProject } from "../src/project.ts";

const tony = "@character Tony\n\n## Identity\nnicknames: the neighbour\ngender: Male\n\n## Look\nexpressions: neutral, nervous\nappearance: Forties.\n  Ironed shirt.\n";
const hall = "@place Stairwell\nnicknames: the landing\nvariants: day, night\nmusic: building\n";

describe("sheets", () => {
  it("parses and writes a sheet back in section order", () => {
    const s = parseSheet(tony)!;
    expect(s.kind).toBe("character");
    expect(s.fields.appearance).toBe("Forties.\nIroned shirt.");
    const again = parseSheet(serializeSheet(s))!;
    expect(again.fields).toEqual(s.fields);
    expect(parseSheet("no header")).toBeNull();
    expect(newSheet("minigame", "Investigation", "From cap1")).toContain("@minigame Investigation");
  });

  it("feeds the cast and backgrounds, and intent.json still wins", () => {
    const r = compileProject({ cast: { TONY: { id: "t", color: "#111111" } } }, { "a.intent": "## S\nthe neighbour: Hi.\n[BG the landing night]\n", "c/tony.sheet": tony, "p/hall.sheet": hall }, ["renpy"]);
    expect(r.config.cast.TONY.id).toBe("t");
    expect(r.config.cast.TONY.color).toBe("#111111");
    expect(r.config.cast.TONY.expressions).toEqual({ neutral: "neutral", nervous: "nervous" });
    const say = r.scripts[0].chapters[0].scenes[0].body.find((n) => n.n === "say");
    expect(say && say.n === "say" && say.speaker).toBe("TONY");
    expect(r.files["renpy/a.rpy"]).toContain("stairwell");
  });

  it("knows where a sheet is used", () => {
    const r = compileProject({}, { "a.intent": "## Stairs\nTONY (angry): No.\nTONY: Fine.\n## Roof\nJuu waits.\n", "t.sheet": tony }, ["renpy"]);
    const u = sheetUsage(r.sheets[0].sheet, r.scripts);
    expect(u.scenes.map((s) => s.title)).toEqual(["Stairs"]);
    expect(u.lines).toBe(2);
    expect(u.missing).toEqual(["angry"]);
    expect(u.unused).toEqual(["neutral", "nervous"]);
  });

  it("spots minigames in prose", () => {
    expect(detectMinigames("Now an Investigation minigame gets triggered. Later the Lockpick puzzle.")).toEqual(["Investigation", "Lockpick"]);
    expect(detectMinigames(">> MINIGAME: Deduction")).toEqual(["Deduction"]);
  });
  it("reads an old pronouns line as gender", () => {
    expect(parseSheet("@character Juu\npronouns: she")!.fields).toEqual({ gender: "Female" });
  });
});

describe("mystery kit", () => {
  const coat = "@clue Wet coat\n\n## Mystery\npointsTo: Tony\nherring: Yes\nknownBy: Juu, Mara\n";
  const knife = "@item Knife\ntype: Evidence\npointsTo: Juu\ntruth: Planted by Tony.\n";
  const tonyS = "@character Tony\nrole: Suspect\nalibi: At the bar until ten.\nalibiHolds: Shaky\n";
  const juu = "@character Juu\nrole: Witness\nknows: Saw the coat at nine.\n";

  it("reads clue sheets and keeps their fields", () => {
    const s = parseSheet(coat)!;
    expect(s.kind).toBe("clue");
    expect(s.fields.pointsTo).toBe("Tony");
    expect(serializeSheet(s)).toContain("## Mystery");
    expect(newSheet("clue", "Wet coat")).toBe("@clue Wet coat\n");
    expect(sheetFileName("clue", "Wet coat")).toBe("clues/wet_coat.sheet");
  });

  it("builds the clue board with scenes, suspects and gaps", () => {
    const r = compileProject({}, { "a.intent": "## Hall\nThe wet coat hangs by the door.\n## Bar\nTONY: I was here.\n", "clues/coat.sheet": coat, "items/knife.sheet": knife, "c/tony.sheet": tonyS, "c/juu.sheet": juu }, ["renpy"]);
    const b = clueBoard(r.sheets, r.scripts);
    expect(b.clues.map((c) => [c.name, c.kind, c.scenes.map((s) => s.title)])).toEqual([["Knife", "Evidence", []], ["Wet coat", "clue", ["Hall"]]]);
    expect(b.suspects.map((s) => [s.name, s.clues])).toEqual([["Juu", ["Knife"]], ["Tony", ["Wet coat"]]]);
    expect(b.warnings.map((w) => w.message)).toEqual([
      "Knife never appears in a script yet.",
      "Wet coat is a red herring, but its real meaning isn't written down.",
      "Wet coat is known by Mara, who has no character sheet.",
    ]);
  });
});
