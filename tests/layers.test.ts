import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/core/config.ts";
import { applyConversion, draftToScript } from "../src/core/convert.ts";
import { parseScript } from "../src/core/parser.ts";
import { compileProject } from "../src/project.ts";

const cfg = loadConfig({
  narrator: "MIRIAM",
  cast: { MIRIAM: { id: "m" }, FREE: { id: "f", display: "Free" }, TONY: { id: "t", display: "Tony" } },
});

describe("fenced layers", () => {
  const src = [
    "## Stairs",
    "::: draft",
    "The stairwell again.",
    "// this slash stays: it's prose",
    "",
    "“Go back,” he says.",
    ":::",
    "FREE: Script line.",
    "::: renpy",
    "with Dissolve(0.6)",
    ":::",
    "::: mv",
    "$gameScreen.startFlash([255,255,255,128], 8);",
    ":::",
  ].join("\n");

  it("keeps draft and code blocks verbatim", () => {
    const body = parseScript(src, cfg).chapters[0].scenes[0].body;
    expect(body.map((n) => n.n)).toEqual(["draft", "say", "code", "code"]);
    expect(body[0]).toMatchObject({ n: "draft", line: 2, text: "The stairwell again.\n// this slash stays: it's prose\n\n“Go back,” he says." });
    expect(body[2]).toMatchObject({ engine: "renpy", text: "with Dissolve(0.6)" });
  });

  it("passes code to its own engine only and exports drafts as narration", () => {
    const r = compileProject({ narrator: "MIRIAM", cast: { MIRIAM: { id: "m" }, FREE: { id: "f" } } }, { "s.intent": src });
    const rpy = r.files["renpy/s.rpy"];
    expect(rpy).toContain('    m "The stairwell again. // this slash stays: it\'s prose"');
    expect(rpy).toContain("    with Dissolve(0.6)");
    expect(rpy).toContain("# ::: mv block (other engine)");
    const mv = JSON.parse(r.files["mv/CommonEvents.intent.json"]).flatMap((e: { list: unknown[] }) => e.list);
    expect(mv).toContainEqual({ code: 355, indent: 0, parameters: ["$gameScreen.startFlash([255,255,255,128], 8);"] });
    expect(r.files["renpy/REPORT.md"]).toContain("draft prose exported as plain narration");
  });

  it("flags an unclosed block", () => {
    expect(parseScript("::: draft\nHello", cfg).diagnostics.some((d) => d.level === "error")).toBe(true);
  });
});

describe("rule converter", () => {
  it("splits narration and tagged dialogue without rewording", () => {
    const r = draftToScript("Free stops.\n\n“Go back upstairs,” he says, without looking at me.\n\n“Who called?” Tony asks. “Not me.”", cfg);
    expect(r.script.split("\n")).toEqual([
      "Free stops.",
      "FREE: Go back upstairs.  // check speaker",
      "// tag: he says, without looking at me.",
      "TONY: Who called?",
      "// tag: Tony asks.",
      "TONY: Not me.",
    ]);
    expect(r.checks[0]).toContain("Guessed FREE");
  });

  it("leaves unattributed quotes for the writer", () => {
    const r = draftToScript("“Hello?”", cfg);
    expect(r.script).toBe("“Hello?”  // speaker unclear");
    expect(r.checks[0]).toContain("Speaker unclear");
  });

  it("splits long narration at sentence ends", () => {
    const long = "One sentence that is quite long and goes on. ".repeat(6).trim();
    const lines = draftToScript(long, cfg).script.split("\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe(long);
  });

  it("swaps the draft for script and keeps the prose", () => {
    const src = "## A\n::: draft\nFree stops.\n:::\nEnd.";
    const out = applyConversion(src, 2, "Free stops.");
    expect(out).toBe("## A\nFree stops.\n::: was-draft\nFree stops.\n:::\nEnd.");
    expect(parseScript(out, cfg).chapters[0].scenes[0].body.map((n) => n.n)).toEqual(["say", "original", "say"]);
  });
});
