# Intent Script v0.1

One plain-text format for narrative games. It merges two formats Nero already writes in:
**LimOut Script** (a screenplay for a Ren'Py visual novel) and **Quest Script** (blocks
describing an RPG Maker MV world). Anything valid in either is valid here; the parts
that only made sense for one game are now project settings in `intent.json`.

A project is a folder with `intent.json` and one or more `*.intent` files.

## The deal (unchanged from LimOut Script)

- Intent never changes the writer's words. Lines go into the game as written.
- Plain-English names: `stairwell`, `scared`, `marble`. The settings map them to real files.
- Missing things never block: a missing background, sprite or track becomes a placeholder
  and a line in the export report.
- Anything Intent can't stage on its own (free descriptions, `!` actions it has no command
  for) is listed in the report, never guessed.

## Lines

| Write | Means |
|---|---|
| `The chair is empty.` | A plain line, spoken by the project's `narrator` (LimOut: Miriam; ConQue: plain narration). |
| `FREE: Go back upstairs.` | Dialogue. Cast names, `@npc` names and aliases work. A new ALL-CAPS name is flagged as a new character. |
| `Lena (smile): Morning!` | Dialogue with a mood (sprite expression in Ren'Py, face in MV). |
| `MIRIAM (as FREE): …` / `M(F): …` / `(as FREE) …` | Voice-as: speaks in another character's colour. Needs `voiceAs: true`. |
| `(hollow) One, two, three.` | A narrator voice from `voices` in the settings. |
| `- And another thing.` | The same speaker keeps talking. |
| `“Emergency services…”` | A voice with no speaker, if `quotedVoice` is set. |
| `// note` or `~ note` | Notes; never in the game. |
| `TODO: Juu reacts here` | A hole: shows in test builds only, listed in the report. |

Inside a line: `*italics*`, `~slow text~`, `|` a short beat, and `[[ … ]]`, which means
whatever `doubleBrackets` says: `"stain"` (LimOut: `[[clickable words | the guess]]`) or
`"link"` (Quest Script: `[[Route 1]]`).

## Stage directions and actions

Square brackets (several per line): `[BG stairwell day, fade]`, `[CG bruno body]`,
`[BLACK]`, `[MUSIC marble]`, `[MUSIC stop]`, `[SOUND thud]`, `[PAUSE 1.5]`, `[SHAKE]`,
`[HIDE FREE]`, `[LINEUP T K J]`, and sprites: `[FREE scared, right]`,
`[FREE enters from right]`, `[F neu, in R]`, `[FREE leaves fast]`, `[F to CR]`,
`[F CL, back]`, `[T C, close]`, `[J R, edge]`, `[K L, facing right]`, `[M faded]`,
`[MIRIAM copying FREE]`. Positions come from the settings (default five spots,
L CL C CR R) or a percentage. Any other bracket is a free description.

`!` actions (Quest Script): `give`, `take`, `gold`, `step`, `switch … on/off`,
`quest start/step/done`, `trust Name +5`, `sfx`, `bgm`, `wait 1s`, `shake 2s`,
`fade in/out`, `erase`; `move`, `face`, `balloon`, `teleport`, `battle`, `shop`, `join`
go to the report for hand staging.

`+` memory (LimOut): `+ evidence: glasses`, `+ met: TONY`, `+ flag: followed_free`.
`flag` is a switch everywhere; other keys are kept as memory (a template per key can be
set for Ren'Py, e.g. `met` → `$ incontra("{slug}")`).

## Choices and conditions

Both choice styles work:

```
? Do I follow him?                ? Take the bread
> Follow Free (+ flag: followed)    ! give Crisp Bread
    I go up.                      ? Leave
> Stay                              Lena: Don't let it go cold!
    I stay.
```

Conditions: `IF cond … ELSE … END` or `when: cond` with an indented body. Conditions read
like English: `followed_free`, `step 2000+`, `has Chopping Axe`, `quest MQ-01 done`,
`trust Lena 50+`, `first time`, `not …`, `a, b` (and), `a or b`.

## Structure

`# CHAPTER 6 · The Pub` starts a chapter, `## Outside, evening` a scene (a label in
Ren'Py, a common event in MV).

`@` blocks describe the world: `@npc`, `@talk Name when: …`, `@route`, `@event`,
`@quest main|side`, `@map`, `@item`, `@enemy`, `@edit kind Name`, `@remove kind Name`,
`@rename kind Old to New`. Fields are `key: value`; `aka` gives a block an alias.
`@talk` and `@event` contain lines like a scene; when several match, the last one
written wins. The rest builds the story bible (`bible.json`).

Custom blocks: `>> TYPE: header` with indented items (`* item (mods)`, `- key: value`,
`key (mods): value`). The project settings decide what each type is (LimOut's
INVESTIGATE, MIND, PRESENT, DEBATE, GAME OVER). Each exports as structured data plus a
call to the project's own minigame code. `>> DRAFT:` is never exported.

## Shortcuts

`@alias SHORT = FULL` (or Quest Script's `@aka short = Full`) replaces whole words in
speaker names, `( )`, `[ ]`, `!`, `+` and conditions, never in narration. Reserved words
can't be aliases. `@macro NAME … @end` defines a reusable block; `@NAME` on its own line
inserts it.

## Project settings (`intent.json`)

| Setting | LimOut | ContraryQuest |
|---|---|---|
| `narrator` | `"MIRIAM"` | `null` |
| `voiceAs`, `voices` | on, `hollow` | off |
| `doubleBrackets` | `"stain"` | `"link"` |
| `blocks` | INVESTIGATE, MIND, PRESENT… | none yet |
| `targets` | `["renpy"]` | `["mv"]` |

Also: `cast` (id, display name, colour, aliases, expressions, MV faces), `assets` (bg,
cg, music, sound name maps), `positions`, `renpy` (voice-as id pattern, memory templates,
label prefix) and `mv` (name box format, line width, screen size, first switch, variable
and common event ids, known ids by name).

## Exports

- **Ren'Py**: one `.rpy` per script file plus `intent_defs.rpy` (characters, voice-as
  characters, positions, placeholders for missing art, a small runtime for flags, items,
  memory and stains).
- **RPG Maker MV**: `CommonEvents.intent.json` (scenes, talks per NPC, events),
  `MapEvents.intent.json` (map events that call them), `System.intent.json` (names for
  every switch and variable used).
- **Both**: `REPORT.md` per engine and `bible.json`.

## Sheets (0.2)

A sheet is one plain-text file per Character, Place, Item or Minigame, kept in
`characters/`, `places/`, `items/` or `minigames/`. The app shows it as a form.

```
@character Tony

## Three versions (0.3)

Each script has three versions, kept as separate texts: **Draft** (prose, `cap1.draft`),
**Play** (Intent Script, `cap1.intent`) and **Code** (Ren'Py, `cap1.rpy`). The tabs switch
between them; nothing converts on its own. A missing Draft or Code is made from Play the
first time it is opened (no Claude needed).

`intent.sync.json` remembers each neighbouring pair (Draft–Play, Play–Code) as it was when
last in sync. When one side changes, both tabs show a dot and the text shows a bar with
**✦ Update**. Claude compares the changed version with its last-synced state and updates the
other one, changing only what the edit needs; Code nobody edited by hand is regenerated by
Intent instead. Every update is shown as a diff to accept, and the old text goes to History.

**Parts for Claude to write.** In the Draft, `{{ a note }}` marks a part the writer leaves
for Claude: `{{ Tony and Limo argue about the alibi; Limo wins, about 300 words }}`. Notes
can run over several lines and sit mid-paragraph. Intent highlights them, and **✦ Write**
on the Draft tab has Claude write each one as prose in the style of the text around it,
using the sheets. The result is shown as a diff to accept; the notes go to History. Until
it is written, ✦ Update carries a note to Play as `// write: note`.

**Write together.** On the Draft tab, **✦ Write together** has Claude continue the Draft
from where it ends: the next page (about 300 words), part (a scene, about 1,200) or
chapter (about 4,000), with an optional direction. It is reviewed like ✦ Write.

**Who wrote what.** Text Claude wrote (✦ Write, Write together) shows in Claude's colour,
and names on sheets are bold, so both read in either colour. Whatever the writer types
inside Claude's text becomes theirs. `intent.authors.json` keeps Claude's stretches with
their text, so they are found again after edits outside Intent. Settings → Show who wrote
what turns the colour off.

Claude uses the writer's own Anthropic API key (Settings → Claude; it stays on the device,
never in the project). Lines Claude is unsure of get a check note. The Ren'Py export uses
your Code version when it is in sync with Play.

## Identity
nicknames: the neighbour
gender: Male

## Look
appearance: Forties, ironed shirt.
  A watch he keeps touching.
expressions: neutral, nervous
```

- First line: `@character|@place|@item|@minigame Name`. Then `key: value` lines;
  indented lines continue the value above. `##` headings are only for reading.
- Character sheets join the cast (cast key = `id` or the name in capitals);
  nicknames become aliases. Place sheets add backgrounds under every name.
  Anything written in `intent.json` wins over a sheet.
- Usage (scenes, spoken lines, expressions asked for but missing, never used) is
  worked out from the scripts and never stored.
- Names on a sheet are underlined in the editor. Minigames mentioned in prose
  ("an Investigation minigame") without a sheet show as stubs.
- `noLink` in `intent.json` lists names that stay plain text.
- Claude reads the sheets when converting drafts: nicknames and gender help pick
  speakers, places add `[BG …]` and their `[MUSIC …]`, minigames add `>> MINIGAME: Name`.
- Fields with a short list of answers (gender, role, entrance side, setting, mood,
  item type, minigame type and difficulty) are dropdowns in the form; some also take
  a value of your own. An old `pronouns:` line is read as gender.

## Find, replace and rename (0.3)

- **Find** (the search button, or Ctrl+Shift+F) searches every script's Draft, Play and Code and every sheet. Code is off by default, since Intent writes most of it. Options: match case, whole word.
- **Replace** works across the whole project or file by file. When both halves of a synced pair are replaced, the pair stays in sync.
- **Renaming a sheet** (edit its name, or use Rename… in its ⋯ menu) renames the file and updates every whole-word mention in scripts and sheets, keeping each mention's case (LIMO → LUNA).
- **Renaming or deleting a script** carries its Draft and Code versions and its sync record with it.
- Every one of these saves the old text to History first, and the toast offers Undo.

## Story check (0.3)

Tools → Story check → **✦ Check story**. Claude reads the open script (or, with *Whole project*, every script) against the sheets and lists problems by severity: continuity slips, contradictions with a sheet, timeline errors, loose threads, and names spelled two ways. Each problem gives a line, a short quote, and a suggested fix. *Go to line* follows the quote even after edits; *Dismiss* hides a problem, and it stays hidden when a later check finds it again. Results are saved in `intent.checks.json` with the project.

## Claude without an API key (0.3)

Settings → Claude → **Copy and paste**, or simply no key. Every ✦ action (Update, Check story, prompt drafting) opens a three-step card: copy the request, paste it into the Claude app, claude.ai or Claude Code, then paste the answer back. The answer goes through the same review as an API answer.

## Folder projects and Claude Code (0.3, Windows and Android apps)

- **Keep in a folder** moves a project into a folder on disk. Folder projects save there as you type; there's no Save button.
- **Set up Claude Code** writes `CLAUDE.md` and `INTENT_SPEC.md` into the folder, so Claude Code knows the format, the three versions, the house rules, and how to write story checks.
- When Intent's window comes back into focus (or on **Reload**), it takes the files changed on disk. A file changed both in Intent and on disk keeps Intent's text; the disk copy goes to History.
- **Mark as in step** in the sync bar tells Intent that two versions already match, for when they were brought in step by hand or by Claude Code.

## Connector (MCP, 0.3)

`intent-mcp` is an MCP server for a folder project, so Claude Code or the Claude desktop app can use Intent's own tools: `intent_overview`, `intent_format`, `intent_read`, `intent_write` (returns Intent's problems after every write), `intent_find`, `intent_replace`, `intent_rename_sheet`, `intent_mark_in_step`, `intent_save_story_check`, and `intent_export`. It only touches Intent's files inside the project folder. Build it with `npm run mcp:build` (→ `dist-mcp/intent-mcp.mjs`, needs Node.js 20+). The Windows app ships it, and **✦ Connect Claude** shows the exact commands.

## Backups and moving between devices (0.3)

- Intent backs up every project on the device (IndexedDB) every ten minutes while it changes, keeping the newest 15. Tools → Backups lists them: **Restore** (the current text becomes a backup first, and Undo is offered) or **Save file**.
- **Save ▾ → Project file** writes the whole project as one `.intentproj` file (a zip with `intent.project.json`). **Open ▾ → Project file** opens it on any device; a newer copy of the same project replaces it, and the old one goes to Backups.

## Assets (0.3)

Export → Assets lists every background, CG, sprite, song and sound the Ren'Py export uses, with the scripts that use it. **Link game folder** (Windows and Android apps; remembered per project on that device) or **Check a folder** (browser; nothing is uploaded) matches them against the game's files the way Ren'Py does: `game/images/**/bg hall.png` is the image `bg hall`, a sprite shown by its tag alone matches any image of that tag, and `game/audio/**/guest.ogg` is the sound `guest`. Missing assets show the file name to add; images no script uses are listed too. Assets are never copied into the project.

A switch at the top picks the engine. For **RPG Maker MV**, Intent reads the MV export's Show Picture, face, BGM and SE commands and looks in `img/pictures`, `img/parallaxes`, `img/faces`, `audio/bgm`, `audio/bgs`, `audio/se` and `audio/me` (encrypted `.rpgmvp`/`.rpgmvo` files count), in the project folder or its `www/`. Each engine remembers its own folder.

The Windows app ships the connector as `intent-mcp.exe` (no Node needed); ✦ Connect Claude fills in its path. The app opens `.intentproj` files on double-click, and opens links such as claude.ai in the system browser.
