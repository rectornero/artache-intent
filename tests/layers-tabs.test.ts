import { describe, expect, it } from "vitest";
import { draftBlocks, draftByRules, fromLayer, renpyToScript, replaceDrafts, toLayer } from "../src/core/layers.ts";
import { example } from "./helpers.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dirname, "..", "examples", "limout", "cap1.intent"), "utf8");

describe("layer tabs", () => {
  const r = example("limout");
  const script = r.scripts[0];

  it("round-trips untouched text exactly, both ways", () => {
    for (const layer of ["draft", "renpy"] as const) {
      const v = toLayer(layer, src, script, r.config);
      expect(v.text).not.toBe(src);
      expect(fromLayer(v, v.text, r.config)).toBe(src);
    }
  });

  it("keeps an edited line as draft prose until the tab changes, then converts it", () => {
    const v = toLayer("draft", src, script, r.config);
    expect(v.text).toContain("“Go back upstairs,” Free says.");
    const edited = v.text.replace("“Go back upstairs,” Free says.", "“Go back down,” Free says.");
    const back = fromLayer(v, edited, r.config);
    expect(back).toContain("::: draft\n“Go back down,” Free says.\n:::");
    const done = replaceDrafts(back, draftBlocks(back).map((b) => draftByRules(b.prose, r.config, r.sheets.map((x) => x.sheet))));
    expect(done).toContain("FREE: Go back down.");
    expect(done).not.toContain("::: draft");
  });

  it("shows draft passages as prose, without fences", () => {
    const v = toLayer("draft", src, script, r.config);
    expect(v.text).not.toContain("::: draft");
    expect(v.text).toContain("Now an Investigation minigame gets triggered.");
  });

  it("joins new prose typed next to a passage into that passage", () => {
    const v = toLayer("draft", src, script, r.config);
    const edited = v.text.replace("Now an Investigation minigame gets triggered.", "Now an Investigation minigame gets triggered.\nTony sighs.");
    const back = fromLayer(v, edited, r.config);
    expect(draftBlocks(back).length).toBe(draftBlocks(src).length);
    expect(draftBlocks(back).at(-1)!.prose).toContain("Juu doesn't look up.");
  });

  it("reads back edited Ren'Py and keeps what it can't read as code", () => {
    const v = toLayer("renpy", src, script, r.config);
    expect(v.text).toContain('f "Go back upstairs."');
    const back = fromLayer(v, v.text.replace('f "Go back upstairs."', 'f "Go back down."\n    $ renpy.notify("hi")'), r.config);
    expect(back).toContain("FREE: Go back down.");
    expect(back).toContain("::: renpy");
  });

  it("reads Ren'Py menus, scenes and sprites", () => {
    const code = ['scene bg tromba_scale', 'show free spaventato', 'menu:', '    m "Do I follow him?"', '    "Follow":', '        f "Come."', '    "Stay":', '        pass', 'play music ospite'].join("\n");
    expect(renpyToScript(code, r.config)).toBe(["[BG stairwell]", "[FREE scared]", "? Do I follow him?", "> Follow", "    FREE: Come.", "> Stay", "[MUSIC guest]"].join("\n"));
  });
});
