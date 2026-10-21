// Every background, CG, sprite, song and sound the scripts use, checked
// against the game folder. The app reads the folder itself (and remembers it
// on this device); the browser checks a folder you pick, each time.

import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon.tsx";
import { fileUrl, gameFolderOf, isTauri, listFolderFiles, pickFolder, pickFolderFiles, setGameFolder } from "./storage.ts";
import { ASSET_KINDS, gameRelative, matchAsset, unusedImages, type Asset, type AssetKind } from "../src/core/assets.ts";

const KIND_NAMES: Record<AssetKind, string> = { background: "Backgrounds", cg: "CGs", sprite: "Sprites", music: "Music", sound: "Sounds" };
const KIND_ICONS: Record<AssetKind, string> = { background: "place", cg: "images", sprite: "character", music: "songs", sound: "sound" };
const isImage = (k: AssetKind) => k === "background" || k === "cg" || k === "sprite";
const expected = (a: Asset) => (isImage(a.kind) ? `images/${a.name}.png` : /[./]/.test(a.name) ? a.name : `audio/${a.name}.ogg`);

/** Where the files come from: a folder on disk (app), or files picked in the browser. */
type Source = { kind: "disk"; dir: string; game: string; files: string[] } | { kind: "picked"; label: string; files: string[]; byPath: Map<string, File> };

export function AssetsPanel({ project, assets, onOpen }: { project: string; assets: Asset[]; onOpen: (script: string) => void }) {
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);

  const loadDisk = async (dir: string) => {
    try {
      const all = (await listFolderFiles(dir)).map((p) => p.replace(/\\/g, "/"));
      // The Ren'Py project folder (with game/ inside), or game/ itself.
      const inGame = all.some((p) => p.startsWith("game/"));
      setSource({ kind: "disk", dir, game: inGame ? `${dir}/game` : dir, files: inGame ? all.filter((p) => p.startsWith("game/")).map((p) => p.slice(5)) : all });
      setError("");
    } catch {
      setError(`Couldn't read ${dir}. Is it still there?`);
    }
  };
  useEffect(() => {
    setSource(null);
    const dir = isTauri() ? gameFolderOf(project) : null;
    if (dir) void loadDisk(dir);
  }, [project]);

  const link = async () => {
    if (isTauri()) {
      const dir = await pickFolder("Your game's folder (the one with game/ inside)");
      if (!dir) return;
      setGameFolder(project, dir);
      return loadDisk(dir);
    }
    const picked = await pickFolderFiles();
    if (!picked) return;
    const paths = [...picked.keys()];
    const rel = gameRelative(paths);
    const prefix = paths.find((p) => /(^|\/)game\//.test(p))?.replace(/game\/.*$/, "game/") ?? "";
    const byPath = new Map(rel.map((r) => [r, picked.get(prefix + r) ?? picked.get(r)!]));
    setSource({ kind: "picked", label: paths[0]?.split("/")[0] ?? "folder", files: rel, byPath });
  };

  const rows = useMemo(() => assets.map((a) => ({ a, found: source ? matchAsset(a, source.files) : null })), [assets, source]);
  const missing = rows.filter((r) => r.found && !r.found.length).length;
  const unused = source ? unusedImages(assets, source.files) : [];

  return (
    <div className="assets" data-testid="assets">
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
                    {found === null ? "Not checked" : found.length ? found.join(", ") : <>Missing: add <code>{expected(a)}</code></>}
                  </span>
                  <span className="asset-uses">
                    {a.scripts.map((s) => <button key={s} className="link" onClick={() => onOpen(s)}>{s}</button>)}
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
          <p className="muted">Spare art, or names that don't match: Ren'Py calls an image by its file name, so <code>images/bg hall.png</code> is <code>bg hall</code>.</p>
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
