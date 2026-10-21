// One file per project, for moving work between devices or keeping a copy
// anywhere: a zip of the project's files plus intent.project.json.

import JSZip from "jszip";

export const PACK_EXT = "intentproj";
const META = "intent.project.json";

export interface PackMeta {
  id: string;
  name: string;
  savedAt: number;
  app: string;
}

export async function pack(meta: PackMeta, files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(META, JSON.stringify(meta, null, 2));
  for (const [name, text] of Object.entries(files)) zip.file(name, text);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export async function unpack(data: ArrayBuffer | Uint8Array): Promise<{ meta: PackMeta; files: Record<string, string> }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error("This isn't an Intent project file.");
  }
  const files: Record<string, string> = {};
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || entry.name === META || entry.name.includes("..") || entry.name.startsWith("/")) continue;
    files[entry.name] = await entry.async("string");
  }
  const raw = await zip.file(META)?.async("string");
  if (!raw && files["intent.json"] === undefined) throw new Error("This isn't an Intent project file.");
  let meta: Partial<PackMeta> = {};
  try {
    meta = JSON.parse(raw ?? "{}");
  } catch {
    // An unreadable label: the files still count.
  }
  let name = meta.name;
  try {
    name ??= JSON.parse(files["intent.json"] ?? "{}").name;
  } catch {
    // Settings unreadable: fall back below.
  }
  return { meta: { id: meta.id ?? `p${Date.now()}`, name: name ?? "Imported project", savedAt: meta.savedAt ?? 0, app: meta.app ?? "" }, files };
}
