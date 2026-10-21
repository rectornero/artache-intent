// Automatic backups of whole projects, kept on this device in IndexedDB (far
// roomier than the browser storage projects live in). A backup is taken while
// you work, at most every ten minutes, and the newest ones are kept.

export interface Backup {
  id: string;
  project: string;
  name: string;
  at: number;
  files: Record<string, string>;
}

const DB = "intent-backups";
const STORE = "backups";
export const KEEP = 15;
export const EVERY_MS = 10 * 60 * 1000;

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" }).createIndex("project", "project");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Newest first. */
export async function listBackups(project: string): Promise<Backup[]> {
  const d = await db();
  const list = await done(d.transaction(STORE).objectStore(STORE).index("project").getAll(project) as IDBRequest<Backup[]>);
  return list.sort((a, b) => b.at - a.at);
}

/** Saves a backup unless the newest one already has these files; trims to KEEP. */
export async function saveBackup(project: string, name: string, files: Record<string, string>, at = Date.now()): Promise<boolean> {
  const list = await listBackups(project);
  if (list[0] && sameFiles(list[0].files, files)) return false;
  const d = await db();
  const tx = d.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  store.put({ id: `${project}@${at}`, project, name, at, files } satisfies Backup);
  for (const old of list.slice(KEEP - 1)) store.delete(old.id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return true;
}

export function sameFiles(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

export const backupSize = (b: Backup) => Object.values(b.files).reduce((n, t) => n + t.length, 0);
