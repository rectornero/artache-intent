import { describe, expect, it } from "vitest";
import { inSync, isVersionFile, markSynced, pairState, SYNC_FILE, versionFile } from "../src/core/sync.ts";

describe("three versions", () => {
  it("names the Draft and Code files after the script", () => {
    expect(versionFile("ch/cap1.intent", "draft")).toBe("ch/cap1.draft");
    expect(versionFile("ch/cap1.intent", "renpy")).toBe("ch/cap1.rpy");
    expect(isVersionFile("ch/cap1.rpy") && isVersionFile(SYNC_FILE) && !isVersionFile("cap1.intent")).toBe(true);
  });

  it("tells which side changed since the last sync", () => {
    const files: Record<string, string> = { "a.intent": "PLAY", "a.draft": "DRAFT" };
    files[SYNC_FILE] = markSynced(files, "a.intent", "draft|play", { play: "PLAY", draft: "DRAFT" });
    expect(inSync(pairState(files, "a.intent", "play", "draft"))).toBe(true);
    files["a.draft"] = "DRAFT, edited";
    expect(pairState(files, "a.intent", "play", "draft")).toEqual({ missing: false, here: false, there: true });
    expect(pairState(files, "a.intent", "draft", "play")).toEqual({ missing: false, here: true, there: false });
    expect(pairState(files, "a.intent", "play", "renpy").missing).toBe(true);
  });
});
