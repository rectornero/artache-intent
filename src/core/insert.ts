// The writer's toolbar: what each Insert button puts in the text, for the Draft
// (prose) and for Play (Intent Script). Pure, so it can be tested.

import { castKeyOf, type Sheet, type SheetKind } from "./sheets.ts";
import { slug } from "./parser.ts";

export interface Snippet {
  text: string;
  /** Goes on lines of its own instead of at the cursor. */
  block: boolean;
}

/** A sheet's name dropped into the Draft or Play. */
export function sheetSnippet(sheet: Sheet, layer: "draft" | "play"): Snippet {
  if (layer === "draft") return { text: sheet.kind === "minigame" ? `the ${sheet.name} minigame` : sheet.name, block: false };
  switch (sheet.kind) {
    case "character": return { text: `${castKeyOf(sheet)}: `, block: true };
    case "place": return { text: `[BG ${sheet.name}]`, block: true };
    case "clue": return { text: `+ evidence: ${slug(sheet.name)}`, block: true };
    case "minigame": return { text: `>> MINIGAME: ${sheet.name}`, block: true };
    default: return { text: sheet.name, block: false };
  }
}

/** What each kind's button inserts, in a word, for its tooltip. */
export const SNIPPET_HINTS: Record<SheetKind, { draft: string; play: string }> = {
  character: { draft: "their name", play: "a line they speak" },
  place: { draft: "its name", play: "a [BG …] change" },
  item: { draft: "its name", play: "its name" },
  minigame: { draft: "“the … minigame”", play: "a >> MINIGAME line" },
  clue: { draft: "its name", play: "a + evidence line" },
};

// Starting points for the interaction blocks the project knows (intent.json `blocks`).
const TEMPLATES: Record<string, string> = {
  INVESTIGATE: ">> INVESTIGATE: Where it happens\n  * Something to examine (important)\n      What I see.\n  * Something else\n      What I see.\n  - empty: Nothing else here.\n  - done: I've seen enough.",
  MIND: ">> MIND: WHO\n  sign: A tell they can't hide.\n  sign (false): Something that looks like a tell.\n  feels: fear / *grief* / boredom\n  thinks: A passing thought. / *What they really think.* / Another thought.",
  PRESENT: ">> PRESENT: The question?\n  answer: evidence\n  else: No. It's not this.",
  DEBATE: ">> DEBATE: What it's about\n  - claim: What they insist on.\n  - counter: evidence\n  - else: That doesn't prove anything.",
  "GAME OVER": ">> GAME OVER: Why it ends",
};

export interface Interaction {
  label: string;
  text: string;
}

/** The interaction groups for Play: choices, conditions, talks and the project's own blocks. */
export function interactions(blocks: Record<string, { export?: boolean }>): Interaction[] {
  const own = Object.keys(blocks)
    .filter((t) => t !== "DRAFT" && t !== "MINIGAME" && blocks[t].export !== false)
    .map((t) => ({ label: t.charAt(0) + t.slice(1).toLowerCase(), text: TEMPLATES[t] ?? `>> ${t}: header\n  - key: value` }));
  return [
    { label: "Choice", text: "? What do I do?\n> First option\n    What happens.\n> Second option\n    What happens." },
    { label: "Condition", text: "IF condition\n  What happens.\nELSE\n  What happens otherwise.\nEND" },
    { label: "Talk", text: "@talk Who\n  What they say when you talk to them." },
    { label: "Event", text: "@event What happens\n  What the player sees." },
    ...own,
  ];
}
