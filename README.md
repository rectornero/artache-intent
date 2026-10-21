# Artache Intent

Write a game script once, in plain text, and export it to **Ren'Py** and **RPG Maker MV**.
Intent grew out of LimOut Script (Liminal Outliers) and Quest Script (ContraryQuest);
the format is in [docs/SPEC.md](docs/SPEC.md).

Private. Nothing here is public without Nero's yes.

## Status

- [x] Core: parser, Ren'Py exporter, RPG Maker MV exporter, story bible, export report
- [x] Examples: `examples/limout` (Ren'Py) and `examples/contraryquest` (MV)
- [x] Editor UI: syntax colours, live preview of the scene under the cursor, Ren'Py / MV /
      report / bible tabs, export (zip in a browser, folder in the app), four themes plus a
      custom theme with its own brand name, layout options, phone layout
- [x] Tauri shell for Windows .exe and Android .apk (`cargo check` passes)
- [ ] First CI build of the .exe and .apk (`.github/workflows/build.yml`)
- [ ] Before release: trademark check on "Artache" (TMview/WIPO, classes 9 and 41)

## Use

```sh
npm install
npm test
npx tsx src/cli.ts examples/limout -o out/limout          # writes out/limout/renpy/*.rpy
npx tsx src/cli.ts examples/contraryquest -o out/cq       # writes out/cq/mv/*.json
```

Editor:

```sh
npm run dev            # browser, http://localhost:5173
npm run tauri dev      # desktop window (needs Rust)
npm run tauri build    # Windows installer when run on Windows
```

The Windows .exe and a debug Android .apk are built by GitHub Actions on every push to
`main` (Actions tab, "build" run, Artifacts). A signed release APK needs a keystore secret.

`src/project.ts` (`compileProject`) is the whole pipeline with no disk access, so the
editor app can call it directly.
