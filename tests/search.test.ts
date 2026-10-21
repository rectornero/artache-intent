import { describe, expect, it } from "vitest";
import { deleteFile, findAll, keepCase, renameScript, renameSheet, replaceAll } from "../src/core/search.ts";
import { inSync, markSynced, pairState, readSync, SYNC_FILE } from "../src/core/sync.ts";

const project = (): Record<string, string> => {
  const files: Record<string, string> = {
    "intent.json": "{}",
    "cap1.intent": "Limo: Hello.\nLIMO waves. Limo's hat.\nLimousine.",
    "cap1.draft": "Limo says hello.",
    "characters/limo.sheet": "@character Limo\n\n## Notes\nLimo is a friend of Mara.",
    "characters/mara.sheet": "@character Mara\n\n## Notes\nKnows Limo.",
  };
  files[SYNC_FILE] = markSynced(files, "cap1.intent", "draft|play", { play: files["cap1.intent"], draft: files["cap1.draft"] });
  return files;
};

describe("search", () => {
  it("finds whole words across versions and sheets", () => {
    const m = findAll(project(), "limo", { wholeWord: true });
    expect(m.map((x) => `${x.file}:${x.line}`)).toEqual([
      "cap1.draft:1", "cap1.intent:1", "cap1.intent:2", "cap1.intent:2", "characters/limo.sheet:1", "characters/limo.sheet:4", "characters/mara.sheet:4",
    ]);
    expect(findAll(project(), "Limo", { matchCase: true, scopes: ["play"] })).toHaveLength(3);
  });

  it("keeps a synced pair in step when both sides are replaced", () => {
    const r = replaceAll(project(), "Limo", "Luna", { wholeWord: true, matchCase: true });
    expect(r.files["cap1.intent"]).toContain("Luna's hat");
    expect(inSync(pairState(r.files, "cap1.intent", "play", "draft"))).toBe(true);
    const one = replaceAll(project(), "Limo", "Luna", { wholeWord: true, scopes: ["play"] });
    expect(pairState(one.files, "cap1.intent", "draft", "play").there).toBe(true);
  });

  it("keeps case when renaming", () => {
    expect(keepCase("LIMO", "Luna")).toBe("LUNA");
    expect(keepCase("limo", "Luna")).toBe("luna");
    expect(keepCase("Limo", "Luna")).toBe("Luna");
  });
});

describe("rename and delete", () => {
  it("renames a sheet and every mention", () => {
    const r = renameSheet(project(), "characters/limo.sheet", "Luna");
    expect(r.to).toBe("characters/luna.sheet");
    expect(r.files["characters/limo.sheet"]).toBeUndefined();
    expect(r.files["characters/luna.sheet"]).toBe("@character Luna\n\n## Notes\nLuna is a friend of Mara.");
    expect(r.count).toBe(5);
    expect(r.files["cap1.intent"]).toBe("Luna: Hello.\nLUNA waves. Luna's hat.\nLimousine.");
    expect(r.files["characters/mara.sheet"]).toContain("Knows Luna.");
    expect(() => renameSheet(project(), "characters/limo.sheet", "Mara")).toThrow(/already/);
  });

  it("moves a script with its versions and sync record", () => {
    const f = renameScript(project(), "cap1.intent", "intro.intent");
    expect(Object.keys(f)).toEqual(expect.arrayContaining(["intro.intent", "intro.draft"]));
    expect(f["cap1.intent"]).toBeUndefined();
    expect(inSync(pairState(f, "intro.intent", "play", "draft"))).toBe(true);
    const d = deleteFile(f, "intro.intent");
    expect(d["intro.draft"]).toBeUndefined();
    expect(readSync(d)["intro.intent"]).toBeUndefined();
  });
});
