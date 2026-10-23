// What Claude Code needs to work on an Intent project folder directly: a
// CLAUDE.md with the house rules, and the Intent Script reference beside it.

import spec from "../docs/SPEC.md?raw";
import { ISSUE_KINDS } from "../src/core/checks.ts";

export const CLAUDE_FILES: Record<string, string> = {
  "CLAUDE.md": `# Artache Intent project

This folder is a game script project for **Artache Intent**, a script editor that exports to Ren'Py and RPG Maker MV. The writer has it open in Intent, which saves here as they type and picks up your edits when its window comes back into focus.

The format is described in [INTENT_SPEC.md](INTENT_SPEC.md). Read it before editing.

## Files

- \`*.intent\`: **Play**, the script in Intent Script. This is the main version.
- \`*.draft\`: **Draft**, the same story as prose, in the writer's own words.
- \`*.rpy\`: **Code**, the Ren'Py version of a script, possibly hand-tuned. Only \`.rpy\` files next to a \`.intent\` of the same name belong to Intent.
- \`*.mv.json\`: **MV**, for RPG Maker MV projects: the script's common events as JSON, one command per line, possibly hand-tuned. Keep \`events\`, \`switches\` and \`variables\` as they are; Intent uses those names to put the events back with the right ids.
- \`characters/\`, \`places/\`, \`items/\`, \`minigames/\`, \`clues/\`: **sheets** (\`*.sheet\`), one per character, place, item, minigame or clue.
- \`intent.json\`: project settings.
- \`intent.sync.json\`: Intent's record of which versions are in step. **Never edit it.**
- \`intent.checks.json\`: story check results (see below).
- \`intent.levels.json\`: in each Draft, the lines the writer marked by hand as Intent (keywords or a sketch to write out), Written (keep word for word) or Request (an ask for you, never story). Other lines are judged by simple rules. Leave it alone.

## Rules

- Never reword the writer's text unless asked. Dialogue and narration carry over word for word between Draft and Play.
- Keep the versions in step when you change one: Draft and Play, Play and Code, and Play and MV. Follow how each is already written.
- When unsure, leave a note line just above: \`// check: why\` in Play, \`# check: why\` in Code, \`[check: why]\` in Draft.
- Drafts use intent writing: some lines are finished text, some are keywords or a sketch still to be written out, and lines starting with \`/\` or \`»\` are requests to you. When asked to write, write intent out in the writer's style, keep finished text word for word, and never put a request in the story.
- Use "gender", never "pronouns", on sheets.
- After editing, tell the writer which files you changed. If you kept versions in step yourself, they can press **Mark as in step** in Intent's sync bar; otherwise they can use **✦ Update** there.
- Don't touch \`.rpy\` files that have no \`.intent\` beside them, or anything under \`out/\`.

## Story checks

When asked to check the story, read the scripts against the sheets and write the problems to \`intent.checks.json\`. Intent shows them under Tools → Story check. Keep the \`dismissed\` list as it is, and set \`checked\` for each script you read to the current time in milliseconds:

\`\`\`json
{
 "checked": { "cap1.intent": 1761062400000 },
 "issues": [
  { "id": "any-unique-text", "file": "cap1.intent", "line": 12, "quote": "a few exact words from that line",
    "kind": "${ISSUE_KINDS.join(" | ")}", "severity": "high | medium | low",
    "problem": "One sentence.", "suggestion": "One sentence." }
 ],
 "dismissed": []
}
\`\`\`

Report only real problems: continuity slips, contradictions with a sheet, timeline errors, loose threads, and names spelled two ways. Don't report style or taste.
`,
  "INTENT_SPEC.md": spec,
};
