// Every background, CG, sprite, face, song and sound the scripts use, for
// Ren'Py or RPG Maker MV, checked against the game folder. The app reads the folder itself (and remembers it
// on this device); the browser checks a folder you pick, each time.

import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon.tsx";
import { fileUrl, gameFolderOf, isTauri, listFolderFiles, pickFolder, pickFolderFiles, setGameFolder } from "./storage.ts";
import { ASSET_KINDS, engineRoot, matchAsset, unusedImages, type Asset, type AssetKind, type Engine } from "../src/core/assets.ts";

const KIND_NAMES: Record<AssetKind, string> = { background: "Backgrounds", cg: "CGs", sprite: "Sprites", face: "Faces", music: "Music", sound: "Sounds" };
const KIND_ICONS: Record<AssetKind, string> = { background: "place", cg: "images", sprite: "character", face: "identity", music: "songs", sound: "sound" };
const ENGINE_NAMES: Record<Engine, string> = { renpy: "Ren'Py", mv: "RPG Maker MV" };
const isImage = (k: AssetKind) => k !== "music" && k !== "sound";
const expected = (a: Asset, engine: Engine) => {
  if (engine === "mv") return `${{ background: "img/pictures", cg: "img/pictures", sprite: "img/pictures", face: "img/faces", music: "audio/bgm", sound: "audio/se" }[a.kind]}/${a.name}.${isImage(a.kind) ? "png" : "ogg"}`;
  return isImage(a.kind) ? `images/${a.name}.png` : /[./]/.test(a.name) ? a.name : `audio/${a.name}.ogg`;
};
const folderKey = (project: string, engine: Engine) => (engine === "renpy" ? project : `${project}|mv`);

/** Where the files come from: a folder on disk (app), or files picked in the browser. */
type Source = { kind: "disk"; dir: string; game: string; files: string[] } | { kind: "picked"; label: string; files: string[]; byPath: Map<string, File> };

export function AssetsPanel({ project, byEngine, onOpen }: { project: string; byEngine: Record<Engine, Asset[]>; onOpen: (script: string) => void }) {
  const [engine, setEngine] = useState<Engine>(() => (byEngine.renpy.length || !byEngine.mv.length ? "renpy" : "mv"));
  const assets = byEngine[engine];
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);

  const loadDisk = async (dir: string) => {
    try {
      // Ren'Py: the project folder (with game/ inside) or game/ itself. MV: the project, or its www/.
      const { prefix, files } = engineRoot(await listFolderFiles(dir), engine);
      setSource({ kind: "disk", dir, game: prefix ? `${dir}/${prefix.replace(/\/$/, "")}` : dir, files });
      setError("");
    } catch {
      setError(`Couldn't read ${dir}. Is it still there?`);
    }
  };
  useEffect(() => {
    setSource(null);
    const dir = isTauri() ? gameFolderOf(folderKey(project, engine)) : null;
    if (dir) void loadDisk(dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, engine]);

  const link = async () => {
    if (isTauri()) {
      const dir = await pickFolder(engine === "renpy" ? "Your Ren'Py game's folder (the one with game/ inside)" : "Your RPG Maker MV project folder");
      if (!dir) return;
      setGameFolder(folderKey(project, engine), dir);
      return loadDisk(dir);
    }
    const picked = await pickFolderFiles();
    if (!picked) return;
    const paths = [...picked.keys()];
    const { prefix, files } = engineRoot(paths, engine);
    const byPath = new Map(files.map((r) => [r, picked.get(prefix + r)!]));
    setSource({ kind: "picked", label: paths[0]?.split("/")[0] ?? "folder", files, byPath });
  };

  const rows = useMemo(() => assets.map((a) => ({ a, found: source ? matchAsset(a, source.files, engine) : null })), [assets, source, engine]);
  const missing = rows.filter((r) => r.found && !r.found.length).length;
  const unused = source ? unusedImages(assets, source.files, engine) : [];

  return (
    <div className="assets" data-testid="assets">
      <div className="seg" role="radiogroup" aria-label="Engine">
        {(["renpy", "mv"] as Engine[]).map((e) => (
          <button key={e} role="radio" aria-checked={engine === e} className={engine === e ? "on" : ""} onClick={() => setEngine(e)}>{ENGINE_NAMES[e]}</button>
        ))}
      </div>
      <div className="assets-head">
        <div>
          <b>{assets.length} asset{assets.length === 1 ? "" : "s"} used</b>
          {source && <span className={missing ? "warn" : "good"}> · {missing ? `${missing} missing` : "all found"}</span>}
          <div className="muted assets-where">
            {source ? (source.kind === "disk" ? source.game : `Checked: ${source.label}`) : isTauri() ? "Link your game folder to check which files exist." : "Pick your game folder to check which files exist. Nothing is uploaded."}
          </div>
        </div>
        <span className="spacer" />
        {source && <button className={`chip-toggle ${onlyMissing ? "on" : ""}`} aria-pressed={onlyMissing} onClick={() => setOnlyMissing(!onlyMissing)}>Missing only</button>}
        <button onClick={() => void link()} data-testid="link-game">{source ? (isTauri() ? "Change folder" : "Check again") : isTauri() ? "Link game folder" : "Check a folder"}</button>
      </div>
      {error && <p className="handoff-error">{error}</p>}
      {!assets.length && <p className="muted">No backgrounds, sprites or sounds in the scripts yet.</p>}
      {ASSET_KINDS.map((k) => {
        const list = rows.filter((r) => r.a.kind === k && (!onlyMissing || (r.found && !r.found.length)));
        if (!list.length) return null;
        return (
          <section key={k} className="asset-group">
            <h4><Icon name={KIND_ICONS[k]} size={15} />{KIND_NAMES[k]}<span className="muted">{list.length}</span></h4>
            {list.map(({ a, found }) => (
              <div key={a.name} className={`asset-row ${found ? (found.length ? "is-found" : "is-missing") : ""}`}>
                {isImage(k) && <Thumb source={source} path={found?.[0]} />}
                <div className="asset-info">
                  <code>{a.name}</code>
                  <span className="muted">
                    {found === null ? "Not checked" : found.length ? found.join(", ") : <>Missing: add <code>{expected(a, engine)}</code></>}
                  </span>
                  <span className="asset-uses">
                    {a.scripts.map((s) => (s.endsWith(".intent") ? <button key={s} className="link" onClick={() => onOpen(s)}>{s}</button> : <span key={s} className="muted">{s}</span>))}
                  </span>
                </div>
                {found && <span className={`asset-state ${found.length ? "good" : "warn"}`}>{found.length ? "✓" : "!"}</span>}
              </div>
            ))}
          </section>
        );
      })}
      {unused.length > 0 && !onlyMissing && (
        <details className="asset-unused">
          <summary>{unused.length} image{unused.length === 1 ? "" : "s"} in the folder no script uses</summary>
          <p className="muted">{engine === "renpy" ? <>Spare art, or names that don't match: Ren'Py calls an image by its file name, so <code>images/bg hall.png</code> is <code>bg hall</code>.</> : <>Spare art, or names that don't match the pictures and faces the events show.</>}</p>
          <ul>{unused.slice(0, 200).map((p) => <li key={p}><code>{p}</code></li>)}</ul>
        </details>
      )}
    </div>
  );
}

function Thumb({ source, path }: { source: Source | null; path?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!source || !path) return;
    let made: string | null = null;
    let live = true;
    const get = source.kind === "disk" ? fileUrl(`${source.game}/${path}`) : Promise.resolve(URL.createObjectURL(source.byPath.get(path)!));
    get.then((u) => (live ? setUrl((made = u)) : URL.revokeObjectURL(u)), () => undefined);
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [source, path]);
  return <span className="asset-thumb">{url ? <img src={url} alt="" loading="lazy" /> : <Icon name="images" size={16} />}</span>;
}
