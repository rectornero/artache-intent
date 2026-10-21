// The images and sounds a game needs, read from what Intent exports, and
// matched against the files in the game folder the way each engine finds them.
// Ren'Py: game/images/**/"bg stairwell.png" is the image "bg stairwell", and
// game/audio/**/guest.ogg is the sound `guest`. RPG Maker MV: pictures in
// img/pictures, faces in img/faces, music in audio/bgm, sounds in audio/se.

export type Engine = "renpy" | "mv";
export type AssetKind = "background" | "cg" | "sprite" | "face" | "music" | "sound";
export const ASSET_KINDS: AssetKind[] = ["background", "cg", "sprite", "face", "music", "sound"];

export interface Asset {
  kind: AssetKind;
  /** The Ren'Py name: "bg stairwell", "free neutro", "guest", or a file path for quoted audio. */
  name: string;
  /** Scripts that use it. */
  scripts: string[];
}

const IMAGE_EXT = /\.(png|jpe?g|webp|avif|gif|bmp)$/i;
const AUDIO_EXT = /\.(ogg|opus|mp3|wav|flac)$/i;

/** Assets used by Ren'Py files (renpy/<script>.rpy → its script), in order of kind, then name. */
export function assetsFromRenpy(rpy: Record<string, string>, scriptOf: (file: string) => string = (f) => f): Asset[] {
  const found = new Map<string, Asset>();
  const add = (kind: AssetKind, name: string, file: string) => {
    const key = `${kind}:${name}`;
    const a = found.get(key) ?? { kind, name, scripts: [] };
    const s = scriptOf(file);
    if (!a.scripts.includes(s)) a.scripts.push(s);
    found.set(key, a);
  };
  for (const [file, text] of Object.entries(rpy)) {
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      let m = line.match(/^scene\s+(.+?)(?:\s+(?:at|with|behind|onlayer|zorder|as)\b.*)?:?$/);
      if (m) {
        const name = m[1].trim();
        add(name.startsWith("cg ") ? "cg" : "background", name, file);
        continue;
      }
      m = line.match(/^show\s+(.+?)(?:\s+(?:at|with|behind|onlayer|zorder|as)\b.*)?:?$/);
      if (m && !m[1].startsWith("screen ") && !m[1].startsWith("expression ")) {
        add("sprite", m[1].trim(), file);
        continue;
      }
      m = line.match(/^(?:play|queue)\s+(music|sound|voice|audio)\s+("([^"]+)"|'([^']+)'|[\w.]+)/);
      if (m) add(m[1] === "music" ? "music" : "sound", m[3] ?? m[4] ?? m[2].replace(/^audio\./, ""), file);
    }
  }
  return [...found.values()].sort((a, b) => ASSET_KINDS.indexOf(a.kind) - ASSET_KINDS.indexOf(b.kind) || a.name.localeCompare(b.name));
}

/** Assets used by the MV export: every Show Picture, face, BGM and SE, with the event it's in. */
export function assetsFromMv(mv: Record<string, string>): Asset[] {
  const found = new Map<string, Asset>();
  const add = (kind: AssetKind, name: string, where: string) => {
    if (!name) return;
    const a = found.get(`${kind}:${name}`) ?? { kind, name, scripts: [] };
    if (where && !a.scripts.includes(where)) a.scripts.push(where);
    found.set(`${kind}:${name}`, a);
  };
  const walk = (v: unknown, where: string) => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, where));
    if (!v || typeof v !== "object") return;
    const o = v as { code?: number; parameters?: unknown[]; name?: unknown };
    const here = typeof o.name === "string" && o.code === undefined ? o.name : where;
    if (typeof o.code === "number" && Array.isArray(o.parameters)) {
      const p = o.parameters;
      if (o.code === 231) add(p[0] === 1 ? "background" : "sprite", String(p[1] ?? ""), where);
      else if (o.code === 101) add("face", String(p[0] ?? ""), where);
      else if (o.code === 241 || o.code === 245) add("music", String((p[0] as { name?: string })?.name ?? ""), where);
      else if (o.code === 250 || o.code === 249) add("sound", String((p[0] as { name?: string })?.name ?? ""), where);
    }
    for (const x of Object.values(o)) if (x && typeof x === "object") walk(x, here);
  };
  for (const [file, text] of Object.entries(mv)) {
    if (!file.endsWith(".json")) continue;
    try {
      walk(JSON.parse(text), "");
    } catch {
      // Not JSON: nothing to read.
    }
  }
  return [...found.values()].sort((a, b) => ASSET_KINDS.indexOf(a.kind) - ASSET_KINDS.indexOf(b.kind) || a.name.localeCompare(b.name));
}

const MV_DIRS: Record<AssetKind, string[]> = {
  background: ["img/pictures/", "img/parallaxes/"],
  cg: ["img/pictures/"],
  sprite: ["img/pictures/"],
  face: ["img/faces/"],
  music: ["audio/bgm/", "audio/bgs/"],
  sound: ["audio/se/", "audio/me/"],
};
const MV_IMAGE = /\.(png|rpgmvp|png_)$/i;
const MV_AUDIO = /\.(ogg|m4a|rpgmvo|ogg_|rpgmvm|m4a_)$/i;

/** Paths the engine would use for the asset (relative to its root); empty if none. */
export function matchAsset(a: Asset, gameFiles: string[], engine: Engine = "renpy"): string[] {
  const base = (p: string) => p.split("/").pop()!.replace(/\.[^.]+$/, "").toLowerCase();
  if (engine === "mv") {
    const ext = a.kind === "music" || a.kind === "sound" ? MV_AUDIO : MV_IMAGE;
    return gameFiles.filter((p) => ext.test(p) && MV_DIRS[a.kind].some((d) => p.toLowerCase().startsWith(d) && !p.slice(d.length).includes("/")) && base(p) === a.name.toLowerCase());
  }
  if (a.kind === "music" || a.kind === "sound") {
    if (/[./]/.test(a.name)) return gameFiles.filter((p) => p.toLowerCase() === a.name.toLowerCase());
    return gameFiles.filter((p) => AUDIO_EXT.test(p) && p.toLowerCase().startsWith("audio/") && base(p).replace(/[^a-z0-9_]/g, "_") === a.name.toLowerCase());
  }
  const want = a.name.toLowerCase().replace(/\s+/g, " ");
  const images = gameFiles.filter((p) => IMAGE_EXT.test(p) && p.toLowerCase().startsWith("images/"));
  const exact = images.filter((p) => base(p).replace(/\s+/g, " ") === want);
  // A sprite shown by its tag alone ("show tony") uses any image of that tag.
  if (exact.length || a.kind !== "sprite" || want.includes(" ")) return exact;
  return images.filter((p) => base(p).startsWith(`${want} `));
}

/** Images no script uses: candidates for clean-up, or names to fix. */
export function unusedImages(assets: Asset[], gameFiles: string[], engine: Engine = "renpy"): string[] {
  const used = new Set(assets.flatMap((a) => matchAsset(a, gameFiles, engine)));
  if (engine === "mv") return gameFiles.filter((p) => MV_IMAGE.test(p) && /^img\/(pictures|faces)\/[^/]+$/i.test(p) && !used.has(p));
  return gameFiles.filter((p) => IMAGE_EXT.test(p) && p.toLowerCase().startsWith("images/") && !used.has(p));
}

/** Paths below the chosen folder, made relative to its game/ folder (Ren'Py's root for assets). */
export function gameRelative(paths: string[]): string[] {
  const norm = paths.map((p) => p.replace(/\\/g, "/"));
  const at = norm.find((p) => /(^|\/)game\//.test(p));
  if (!at) return norm;
  const prefix = at.slice(0, at.search(/(^|\/)game\//) + (at.startsWith("game/") ? 0 : 1)) + "game/";
  return norm.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length));
}

/** Where the engine's root sits among the picked paths ("MyGame/game/", "Proj/www/"), and the paths below it. */
export function engineRoot(paths: string[], engine: Engine): { prefix: string; files: string[] } {
  const norm = paths.map((p) => p.replace(/\\/g, "/"));
  const re = engine === "renpy" ? /(^|\/)game\// : /(^|\/)(img|audio)\//;
  const at = norm.find((p) => re.test(p));
  if (!at) return { prefix: "", files: norm };
  const i = at.search(re);
  const prefix = engine === "renpy" ? `${at.slice(0, i + (i === 0 && at.startsWith("game/") ? 0 : 1))}game/` : at.slice(0, i + (i === 0 && !at.startsWith("/") && /^(img|audio)\//.test(at) ? 0 : 1));
  return { prefix, files: norm.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length)) };
}
