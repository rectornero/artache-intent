# Artache Intent

Write a game script once, in plain text, and export it to **Ren'Py** and **RPG Maker MV**.
Intent grew out of LimOut Script (Liminal Outliers) and Quest Script (ContraryQuest);
the format is in [docs/SPEC.md](docs/SPEC.md).

Private. Nothing here is public without Nero's yes.

## Status

- [x] Core: parser, Ren'Py exporter, RPG Maker MV exporter, story bible, export report
- [x] Examples: `examples/limout` (Ren'Py) and `examples/contraryquest` (MV)
- [ ] Editor UI with swappable themes (brand is a theme)
- [ ] Windows .exe and Android .apk (Tauri)
- [ ] Before release: trademark check on "Artache" (TMview/WIPO, classes 9 and 41)

## Use

```sh
npm install
npm test
npx tsx src/cli.ts examples/limout -o out/limout          # writes out/limout/renpy/*.rpy
npx tsx src/cli.ts examples/contraryquest -o out/cq       # writes out/cq/mv/*.json
```

`src/project.ts` (`compileProject`) is the whole pipeline with no disk access, so the
editor app can call it directly.
