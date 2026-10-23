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

A sheet is one plain-text file per Character, Place, Item, Minigame or Clue, kept in
`characters/`, `places/`, `items/`, `minigames/` or `clues/`. The app shows it as a form.

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

**Intent writing (0.5 "Origami").** A Draft can be written at whatever detail each moment
deserves, with requests to Claude in the same text. Every line is read on its own, by rules,
with no Claude and nothing to format (no paragraphs needed):

| Level | What it is | ✦ Unfold |
|---|---|---|
| **Intent** | keywords (`museum, cats, peaceful sky`) or a sketch (`they argue, then Limo wins`) | written out as prose in the style around it |
| **Written** | finished text: starts with a capital and ends like a sentence, or dialogue | kept word for word; only keywords Claude finds inside it are written out |
| **Request** | an ask for Claude (`/ make it colder`, `I want a minigame where…`, `Can you…`) | carried out, never put in the story; a minigame, character, place, item or clue it asks for becomes a new sheet |

The rules (in `src/core/levels.ts`): a request starts with `/`, `»`, `Claude,`, `@claude` or an
ask (`I want`, `make`, `write`, `can you`, `voglio`, `puoi`…); dialogue is Written; a line with a
length to aim for (`(about 200 words)`), with almost no glue words (articles, pronouns,
prepositions: under 20%), made of short bits (2–3 words between commas), or sketching
(`then`, `poi`, `->`, `→`) is Intent; a capital at the start and a full stop at the end is
Written; anything else is Intent. Headings, comments and dividers (`—`, `---`) are not judged.

Intent shows each line's level in the text (Intent in a softer italic, Requests on a band in
the accent colour, Written as plain text) and as a thin edge left of the line. A tap on the
edge corrects it: **Keep as written**, **Intent**, **Request**, or **Let the rules decide**.
Typing `\ ` (intent) or `/ ` (request) at the start of a line does the same, and the tag goes.
The writer's choices follow their line through edits and are kept in `intent.levels.json`
with the line's text, so they are found again after edits outside Intent. The writer's
toolbar has **\ Intent** and **/ Request** for phones. Settings → Show levels of detail hides it
all.

**✦ Unfold** (on the Draft tab, with a count of what is left) sends the Draft to Claude with
each line's level. The result is a diff to accept, with each request's answer and one short
**writing tip** drawn from what Claude did with this text (Settings → Show writing tips).
Accepting writes the new sheets (never over an existing one) and marks the requests carried
out (`✓ carried out`; ✦ Unfold leaves them alone after that). Requests never go into the
manuscript or Play.

`{{ notes }}` (0.3 and 0.4) are retired: the first time a Draft with notes opens, each note
becomes a line of its own (the text before goes to History), and ✦ Unfold reads it like any
other line.

**Write together.** On the Draft tab, **✦ Write together** has Claude continue the Draft
from where it ends: the next page (about 300 words), part (a scene, about 1,200) or
chapter (about 4,000), with an optional direction. It is reviewed like ✦ Unfold.

**Who wrote what.** Text Claude wrote (✦ Unfold, Write together) shows in Claude's colour,
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

- First line: `@character|@place|@item|@minigame|@clue Name`. Then `key: value` lines;
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

**MV version (0.4).** Projects that export to RPG Maker MV (`targets` includes `"mv"`)
get a fourth tab, **MV**: the script's common events as JSON (`cap1.mv.json`), one event
command per line, for hand-tuning the way Code is for Ren'Py. It pairs with Play like Code
does (dot, bar, ✦ Update; an MV nobody edited is rewritten by Intent with no Claude). The
file also keeps every event, switch and variable name its ids stood for, so Export puts a
hand-tuned MV back by name: each event takes the id the export gives that name, and
switches, variables and calls to other events follow their names even after other scripts
moved the ids on. Export uses the MV version only while it is in step with Play; one that
isn't valid JSON is skipped, and the MV report says so.

**Word count and goals (0.4).** Under the text: words in this Draft or Play (what is said
and narrated, not directions), the whole project (each script's Draft, or its Play where
there is none), and words typed today on this device. **Set goals** keeps a project goal
and a daily goal in `intent.json` (`"goals": { "words": 80000, "daily": 500 }`); meters fill
and a toast marks the daily goal. A Draft made from Play, and Claude's writing, don't count
as typed. Settings → Word count hides the line.

**Spellcheck (0.4).** The Draft and Play use the device's own spellcheck; Settings →
Spellcheck turns it off or picks a language. Code and MV are never spellchecked.

**Manuscript (0.4).** Export → Manuscript puts every script's Draft, in file order, into one
manuscript as a Word file or a PDF: a title page with the author and word count, Times
12 pt, double-spaced, first-line indents, chapters (`#`) on new pages, scenes (`##`)
separated by `#` or shown with their titles, and a running header with the page number,
on A4 or US Letter. Script lines, comments and requests to Claude are left out; a script with no
Draft yet uses its Play as prose. The author is kept in `intent.json` (`"author"`).

**Playtest (0.4, Windows app).** ▶ Playtest writes the Ren'Py export into the linked game's
`game/` folder (the one Export → Assets links) and starts the Ren'Py SDK on it. It asks for
the game folder and for the SDK's `renpy.exe` the first time; Settings → Playtest forgets
the SDK.

## Mystery kit (0.4)

- **Clue sheets** (`@clue Name`, in `clues/`): type, what it is, *points to* (who or
  what it seems to accuse), *what it really means*, *red herring* (No, Yes, Partly),
  *found at*, *known by* (characters, comma separated), and where it is planted and
  revealed. An Item whose type is Clue or Evidence counts as a clue too.
- **Character sheets** have a Mystery section: *alibi*, *does the alibi hold?*
  (Unchecked, Holds, Shaky, False) and *knows* (what they know, and when they learn it).
- **Tools → Clues** is the clue board, worked out from the sheets and scripts and never
  stored. By clue: what it points to, its real meaning, who knows it, and every scene
  that mentions it (the first one marked), each a link. By suspect: alibi, whether it
  holds, what they know, and the clues against them. Suspects are characters with the
  role Suspect, Antagonist, Witness or Victim, an alibi, or a clue pointing at them.
- *Still open* lists what looks unfinished: a clue no script mentions, a clue that
  points to nobody, a red herring with no real meaning written down, a *known by* name
  with no character sheet, and a suspect with no alibi or no clue against them.

## Writer's toolbar (0.4)

A row of buttons above the Draft and Play: **Character, Place, Item, Clue, Minigame**,
and in Play **Interaction**. Each lists that kind's sheets, plus *New…*, which makes the
sheet and inserts it. In the Draft a sheet goes in as its name ("the Lockpick minigame"
for a minigame). In Play it goes in the way Intent Script writes it, on its own line: a
character starts a line they speak (`TONY: `), a place a `[BG Stairwell]`, a clue a
`+ evidence: wet_coat`, a minigame a `>> MINIGAME: Lockpick`; an item goes in as its name.
**Interaction** starts a choice, a condition, a `@talk`, an `@event`, or one of the
project's own blocks from `intent.json` (`>> INVESTIGATE`, `>> MIND`, …) with a template
to fill in. Everything inserted is an ordinary edit (Ctrl+Z takes it back). Settings →
Writer's toolbar hides the row.

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
