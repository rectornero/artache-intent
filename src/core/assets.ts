// The images and sounds a game needs, read from the Ren'Py it exports, and
// matched against the files in the game folder the way Ren'Py finds them:
// game/images/**/"bg stairwell.png" is the image "bg stairwell", and
// game/audio/**/guest.ogg is the sound `guest`.

export type AssetKind = "background" | "cg" | "sprite" | "music" | "sound";
export const ASSET_KINDS: AssetKind[] = ["background", "cg", "sprite", "music", "sound"];

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

/** game/ paths that Ren'Py would use for the asset; empty if none. */
export function matchAsset(a: Asset, gameFiles: string[]): string[] {
  const base = (p: string) => p.split("/").pop()!.replace(/\.[^.]+$/, "").toLowerCase();
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

/** Image files in game/images that no script uses: candidates for clean-up, or names to fix. */
export function unusedImages(assets: Asset[], gameFiles: string[]): string[] {
  const used = new Set(assets.flatMap((a) => matchAsset(a, gameFiles)));
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
