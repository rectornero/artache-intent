import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileProject } from "../src/project.ts";

export function example(name: string) {
  const dir = join(import.meta.dirname, "..", "examples", name);
  const settings = JSON.parse(readFileSync(join(dir, "intent.json"), "utf8"));
  const file = name === "limout" ? "cap1.intent" : "prologue.intent";
  return compileProject(settings, { [file]: readFileSync(join(dir, file), "utf8") }, ["renpy", "mv"]);
}
