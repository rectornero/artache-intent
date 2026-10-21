// Folder projects: Intent and other tools (Claude Code, a text editor) edit the
// same files. `base` is each file as Intent last saw it on disk, which tells a
// change made outside Intent apart from one made inside it.

export interface DiskMerge {
  files: Record<string, string>;
  base: Record<string, string>;
  /** Changed or removed on disk, and taken. */
  taken: string[];
  /** Changed on disk and in Intent: Intent keeps its text. */
  both: string[];
}

export function mergeDisk(base: Record<string, string>, files: Record<string, string>, onDisk: Record<string, string>): DiskMerge {
  const out = { ...files };
  const next = { ...base };
  const taken: string[] = [];
  const both: string[] = [];
  for (const [f, text] of Object.entries(onDisk)) {
    if (base[f] === text) continue;
    if (out[f] === undefined || out[f] === base[f]) (out[f] = text), taken.push(f);
    else if (out[f] !== text) both.push(f);
    next[f] = text;
  }
  for (const f of Object.keys(base)) {
    if (onDisk[f] !== undefined) continue;
    if (out[f] === base[f]) delete out[f], taken.push(f);
    delete next[f];
  }
  return { files: out, base: next, taken, both };
}

/** What to write to disk: files that differ from it, and files Intent removed. */
export function diskChanges(base: Record<string, string>, files: Record<string, string>) {
  return {
    changed: Object.fromEntries(Object.entries(files).filter(([f, text]) => base[f] !== text)),
    removed: Object.keys(base).filter((f) => files[f] === undefined),
  };
}
