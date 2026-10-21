import type { Project } from "./storage.ts";
import limoutSettings from "../examples/limout/intent.json?raw";
import limoutCap1 from "../examples/limout/cap1.intent?raw";
import cqSettings from "../examples/contraryquest/intent.json?raw";
import cqPrologue from "../examples/contraryquest/prologue.intent?raw";

// Sheets ship with the samples: examples/limout/characters/tony.sheet -> characters/tony.sheet
const limoutSheets = Object.fromEntries(
  Object.entries(import.meta.glob("../examples/limout/**/*.sheet", { query: "?raw", import: "default", eager: true }) as Record<string, string>).map(([k, v]) => [
    k.replace("../examples/limout/", ""),
    v,
  ]),
);

export const SAMPLES: Project[] = [
  { id: "sample-limout", name: "Liminal Outliers (sample)", files: { "intent.json": limoutSettings, "cap1.intent": limoutCap1, ...limoutSheets } },
  { id: "sample-cq", name: "ContraryQuest (sample)", files: { "intent.json": cqSettings, "prologue.intent": cqPrologue } },
];

export function newProject(name: string): Project {
  const settings = {
    name,
    targets: ["renpy"],
    narrator: null,
    cast: { HERO: { id: "h", display: "Hero", color: "#4f7cff" } },
  };
  return {
    id: `p-${Date.now().toString(36)}`,
    name,
    files: {
      "intent.json": JSON.stringify(settings, null, 2),
      "chapter1.intent": "# Chapter 1\n## The beginning\n\n[BG street]\nIt starts on an ordinary morning.\nHERO: Here we go.\n",
    },
  };
}
