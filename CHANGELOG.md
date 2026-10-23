# Changelog

Artache Intent Writer, the writing program of the Artache Intent suite.

## 0.6.2 "Vellum" (2026-10-23)

- **✦ Opinion**, beside ✦ Unfold in the Draft and in Play: Claude's honest read of a part of
  your script. Choose what it reads (the selected text, this scene, this chapter or the whole
  script) and, if you like, what to look at. It answers with what works, what isn't there yet,
  and possible fixes; tap a quote to go to it. Your text doesn't change. Copy keeps the answer.
- Save now offers each version of a script on its own: **Draft as…** (`name.draft`),
  **Play as…** (`name.intent`) and **Code as…** (`name.rpy`), plus MV when it is on.
  Before, "This file as…" always saved Play, which may not have your Draft changes yet.
- Open → Script or sheet also opens a saved `.draft`, as the Draft of its script.

## 0.6.1 "Vellum" (2026-10-23)

- The Draft no longer colours a name before ":" (or a leading "-" or "(…)") as a speaker:
  it is prose. Play keeps its script colours.
- Text goes up to 72 px, in bigger steps at bigger sizes.
- A− and A+ in the top bar, on desktop and phone.

## 0.6.0 "Vellum" (2026-10-23)

A usability round. The feeling of writing comes first.

**No automatic rules.** Intent never marks or changes your words on its own anymore.
- Every Draft line is **Written** unless you mark it. You mark **Intent** or **Request** with
  `\ ` or `/ ` at the start of a line, a tap on the line's edge, or the toolbar. The edge menu
  is now Written / Intent / Request.
- ✦ Unfold writes out only what you marked as Intent and carries out your Requests. Written
  text is kept word for word.
- Old `{{ notes }}` become `\ ` intent lines.
- No spellcheck and no autocorrect.
- Only names of sheets you made are highlighted, and Settings → Highlight names turns that
  off. Minigames named in a script no longer show up as "new" sheets by themselves.

**Writing comfort**
- Formatting in the Draft: **bold**, *italic*, title, subtitle, bullet points and
  `code-like` text, from the toolbar or with Ctrl+B, Ctrl+I, Ctrl+E, Ctrl+Alt+1, Ctrl+Alt+2
  and Ctrl+Shift+8. It shows as it reads, and the marks hide away from the cursor. The Word
  and PDF manuscript keep it.
- The line you write on stays in the middle of the screen (Settings → Keep the line in the
  middle).
- The Draft is a centred page without line numbers (Settings → Line numbers in the Draft).
- **Focus** shows only the page: the corners button in the top bar, Ctrl+., or ⋯ → Focus on
  a phone. Esc leaves.
- Text size goes from 12 to 40 px, also with Ctrl+= and Ctrl+−, and with A− / A+ in Focus.
- New fonts, bundled to work offline: Nunito, Literata, Lora, Atkinson Hyperlegible and
  Courier Prime, alongside Fraunces, Inter and JetBrains Mono. You pick a story font (Draft)
  and a script font (Play) separately.
- Drag the edge of the files column or the panel to resize it (double-click resets). Hide
  either one from the top bar; the panel also has a ✕.
- Gender on character sheets is Male, Female, Unknown or Other. Older values become Other.

**Phone**
- Fewer bars and labels: formatting and the insert buttons are icons, the sync bar is one
  line, the word count shows only this version, and line numbers are hidden.

## 0.5.0 "Origami" (2026-10-23)

- Intent writing in the Draft: Intent, Written and Request levels, a coloured edge to change
  a line's level, and the `\ ` and `/ ` tags.
- ✦ Unfold: Claude writes out intent, keeps written text, carries out requests (new sheets
  too) and ends with a writing tip.
- `{{ notes }}` retired.
- New name, Artache Intent Writer, and a new pen-and-star icon.

## 0.4.0 (2026-10-23)

- Mystery kit (clue sheets, alibis, clue board), writer's toolbar, word count and goals,
  spellcheck, manuscript export (Word and PDF), MV version per script, and playtest in
  Ren'Py from the Windows app.
