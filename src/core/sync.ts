// Three versions of each script, kept as separate texts: Draft (prose),
// Play (Intent Script) and Code (Ren'Py). Each neighbouring pair remembers
// both texts as they were when last synced, so Intent can tell which side
// changed since and offer to update the other. Nothing syncs on its own.

export type Version = "draft" | "play" | "renpy";
export type Pair = "draft|play" | "play|renpy";

export const VERSIONS: Version[] = ["draft", "play", "renpy"];
export const SYNC_FILE = "intent.sync.json";

/** cap1.intent -> cap1.draft (Draft) and cap1.rpy (Code). */
export function versionFile(play: string, v: Version): string {
  if (v === "play") return play;
  return play.replace(/\.intent$/, v === "draft" ? ".draft" : ".rpy");
}

/** Files that belong to another file's versions, or Intent's own records (sync, story checks). */
export const isVersionFile = (name: string) => name === SYNC_FILE || name === "intent.checks.json" || name.endsWith(".draft") || name.endsWith(".rpy");

type SyncRecord = Record<string, Partial<Record<Pair, Partial<Record<Version, string>>>>>;

export function readSync(files: Record<string, string>): SyncRecord {
  try {
    return JSON.parse(files[SYNC_FILE] || "{}") as SyncRecord;
  } catch {
    return {};
  }
}

/** The sync record with one pair marked as in step at these texts. */
export function markSynced(files: Record<string, string>, play: string, pair: Pair, texts: Partial<Record<Version, string>>): string {
  const rec = readSync(files);
  rec[play] = { ...rec[play], [pair]: texts };
  return JSON.stringify(rec, null, 1);
}

export function pairOf(a: Version, b: Version): Pair | null {
  const k = [a, b].sort((x, y) => VERSIONS.indexOf(x) - VERSIONS.indexOf(y)).join("|");
  return k === "draft|play" || k === "play|renpy" ? k : null;
}

export const neighbours = (v: Version): Version[] => (v === "play" ? ["draft", "renpy"] : ["play"]);

export interface PairState {
  /** The other version has no text yet. */
  missing: boolean;
  /** Changed since the pair was last synced. */
  here: boolean;
  there: boolean;
}

/** How version `v` stands against its neighbour `n` for one script. */
export function pairState(files: Record<string, string>, play: string, v: Version, n: Version): PairState {
  const pair = pairOf(v, n)!;
  const base = readSync(files)[play]?.[pair];
  const mine = files[versionFile(play, v)];
  const theirs = files[versionFile(play, n)];
  if (theirs === undefined || mine === undefined) return { missing: theirs === undefined, here: false, there: false };
  if (!base) return { missing: false, here: true, there: true };
  return { missing: false, here: mine !== base[v], there: theirs !== base[n] };
}

export const inSync = (s: PairState) => !s.missing && !s.here && !s.there;
