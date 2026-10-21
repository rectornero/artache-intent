import { describe, expect, it } from "vitest";
import { pack, unpack } from "../src/core/pack.ts";

describe("project file", () => {
  it("round-trips a project with its folders", async () => {
    const files = { "intent.json": '{"name":"Limout"}', "cap1.intent": "# One", "characters/juu.sheet": "@character Juu\n" };
    const data = await pack({ id: "p1", name: "Limout", savedAt: 5, app: "0.3.0" }, files);
    const back = await unpack(data);
    expect(back.files).toEqual(files);
    expect(back.meta).toEqual({ id: "p1", name: "Limout", savedAt: 5, app: "0.3.0" });
  });

  it("refuses other files", async () => {
    await expect(unpack(new TextEncoder().encode("hello"))).rejects.toThrow(/isn't an Intent project/);
  });
});
