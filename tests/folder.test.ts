import { describe, expect, it } from "vitest";
import { diskChanges, mergeDisk } from "../src/core/folder.ts";

describe("folder projects", () => {
  it("takes outside edits, keeps Intent's own, and follows deletions", () => {
    const base = { "a.intent": "A", "b.intent": "B", "c.intent": "C", "d.intent": "D" };
    const files = { "a.intent": "A", "b.intent": "B, typed in Intent", "c.intent": "C", "d.intent": "D2" };
    const onDisk = { "a.intent": "A by Claude Code", "b.intent": "B by Claude Code", "e.intent": "new" };
    const m = mergeDisk(base, files, onDisk);
    expect(m.files).toEqual({ "a.intent": "A by Claude Code", "b.intent": "B, typed in Intent", "d.intent": "D2", "e.intent": "new" });
    expect(m.taken.sort()).toEqual(["a.intent", "c.intent", "e.intent"]);
    expect(m.both).toEqual(["b.intent"]);
    // b and d are then written back over the disk copy.
    expect(diskChanges(m.base, m.files)).toEqual({ changed: { "b.intent": "B, typed in Intent", "d.intent": "D2" }, removed: [] });
  });
});
