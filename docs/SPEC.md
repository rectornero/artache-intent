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

## Layer tabs (0.3)

Draft, Play and Ren'Py show the same file. Draft shows dialogue as prose and `::: draft`
passages as plain text, without fences. New or edited prose stays as written in a
`::: draft` passage while you're in Draft; leaving the tab converts every draft passage
in the file at once, and the toast offers Undo. In a draft passage, one line is one
paragraph.

Conversion uses Claude when an Anthropic API key is added in Settings → Claude (the key
stays on the device, never in the project), and the built-in rules otherwise or if
Claude fails. Lines either converter is unsure of get a `// check:` note.

## Identity
nicknames: the neighbour
pronouns: he

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
- Draft conversion reads sheets: nicknames and pronouns pick speakers, place
  names add `[BG …]` and the place's `[MUSIC …]`, minigame phrases add
  `>> MINIGAME: Name`.
