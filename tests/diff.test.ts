import { describe, expect, it } from "vitest";
import { diffStats, lineDiff } from "../src/core/diff.ts";

describe("line diff", () => {
  it("marks added and removed lines and keeps the rest", () => {
    const d = lineDiff("a\nb\nc\nd", "a\nB\nc\nd\ne");
    expect(d.map((l) => `${l.op[0]}${l.text}`)).toEqual(["sa", "aB", "db", "sc", "sd", "ae"]);
    expect(diffStats(d)).toEqual({ added: 2, removed: 1 });
  });

  it("finds nothing between equal texts", () => {
    expect(diffStats(lineDiff("x\ny", "x\ny"))).toEqual({ added: 0, removed: 0 });
  });
});
