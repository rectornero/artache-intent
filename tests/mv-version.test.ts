import { describe, expect, it } from "vitest";
import { formatMv, mvVersionText, parseMv, withMvVersions } from "../src/core/mvVersion.ts";
import { compileProject, exportWithVersions } from "../src/project.ts";
import { markSynced, SYNC_FILE, versionFile, versionOf } from "../src/core/sync.ts";

const settings = { targets: ["mv"], cast: { NERO: { id: "nero", display: "Nero" } } };
const a = "## Morning\nNERO: Hi.\n? Go out\n  + flag: went_out\n## Noon\nNERO: Lunch.\n";
const b = "## Evening\nIF went_out\n  NERO: I went out.\nEND\n+ flag: tired\n";

describe("MV version", () => {
  it("names its file and is a version", () => {
    expect(versionFile("cap1.intent", "mv")).toBe("cap1.mv.json");
    expect(versionOf("cap1.mv.json")).toBe("mv");
  });

  it("holds one script's events, one command per line, and reads back", () => {
    const r = compileProject(settings, { "a.intent": a, "b.intent": b }, ["mv"]);
    const text = mvVersionText(r.mv!, "b.intent");
    const v = parseMv(text);
    expect(v.commonEvents.map((e) => e.name)).toEqual(["b · Evening"]);
    expect(text.split("\n").filter((l) => l.trim().startsWith('{"code"')).length).toBe(v.commonEvents[0].list.length);
    expect(formatMv(v)).toBe(formatMv(parseMv(formatMv(v))));
  });

  it("goes back into the export by name, with ids moved on by other scripts", () => {
    const before = compileProject(settings, { "a.intent": a, "b.intent": b }, ["mv"]);
    const tuned = parseMv(mvVersionText(before.mv!, "b.intent"));
    // The writer adds a line by hand.
    tuned.commonEvents[0].list.splice(-1, 0, { code: 108, indent: 0, parameters: ["hand-tuned"] });
    // Later, script a gains a scene and a new flag, so b's ids move on.
    const a2 = "## Dawn\n+ flag: early\n" + a;
    const after = compileProject(settings, { "a.intent": a2, "b.intent": b }, ["mv"]);
    const out = withMvVersions(after.mv!, { "b.intent": formatMv(tuned) });
    const evening = out.commonEvents.find((e) => e.name === "b · Evening")!;
    expect(evening.id).toBe(after.mv!.commonEvents.find((e) => e.name === "b · Evening")!.id);
    expect(evening.list.some((c) => c.code === 108 && c.parameters[0] === "hand-tuned")).toBe(true);
    // Switches follow their names, not their old numbers.
    const id = (name: string) => Number(Object.entries(out.switches).find(([, n]) => n === name)![0]);
    const sw = evening.list.filter((c) => c.code === 121 || c.code === 111).map((c) => (c.code === 121 ? c.parameters[0] : c.parameters[1]));
    expect(sw).toEqual(expect.arrayContaining([id("went_out"), id("tired")]));
    expect(out.commonEvents.map((e) => e.name)).toEqual(after.mv!.commonEvents.map((e) => e.name));
  });

  it("is used by Export only while in step with Play", () => {
    const r = compileProject(settings, { "a.intent": a, "b.intent": b }, ["mv"]);
    const tuned = parseMv(mvVersionText(r.mv!, "a.intent"));
    tuned.commonEvents[0].name = "Morning (tuned)";
    const mvText = formatMv(tuned);
    const files: Record<string, string> = { "a.intent": a, "b.intent": b, "a.mv.json": mvText };
    files[SYNC_FILE] = markSynced(files, "a.intent", "play|mv", { play: a, mv: mvText });
    const names = (f: Record<string, string>) => JSON.parse(exportWithVersions(r, f)["mv/CommonEvents.intent.json"]).map((e: { name: string }) => e.name);
    expect(names(files)).toContain("Morning (tuned)");
    expect(names({ ...files, "a.intent": a + "NERO: More.\n" })).not.toContain("Morning (tuned)");
  });

  it("reports a broken MV version and keeps Play's events", () => {
    const r = compileProject(settings, { "a.intent": a }, ["mv"]);
    const out = withMvVersions(r.mv!, { "a.intent": "{ not json" });
    expect(out.problems[0]).toMatch(/a.intent: the MV version isn't valid/);
    expect(out.commonEvents).toEqual(r.mv!.commonEvents);
  });
});
