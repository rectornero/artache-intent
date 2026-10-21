// Saved versions of each file, kept on this device: one before every Claude
// conversion and restore, plus any the writer saves by hand.

export interface Snapshot {
  at: number;
  label: string;
  text: string;
}

const KEY = "intent.history.v1";
export const KEEP = 30;

type Store = Record<string, Record<string, Snapshot[]>>;

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Store;
  } catch {
    return {};
  }
}

export function snapshots(project: string, file: string): Snapshot[] {
  return read()[project]?.[file] ?? [];
}

/** Newest first. A text identical to the newest snapshot isn't saved twice. */
export function saveSnapshot(project: string, file: string, text: string, label: string): Snapshot[] {
  const store = read();
  const list = store[project]?.[file] ?? [];
  if (list[0]?.text === text) return list;
  const next = [{ at: Date.now(), label, text }, ...list].slice(0, KEEP);
  store[project] = { ...store[project], [file]: next };
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Storage full or blocked: drop the oldest half and try once more.
    try {
      store[project][file] = next.slice(0, Math.ceil(KEEP / 2));
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      // Nothing more to do: history just isn't kept.
    }
  }
  return next;
}
