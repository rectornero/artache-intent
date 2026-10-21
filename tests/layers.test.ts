import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/core/config.ts";
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
