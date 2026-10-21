import type { DataBlock, Script } from "../core/ast.ts";
import { conditionText } from "../core/condition.ts";

/**
 * The story bible: every @npc, @map, @quest, @route, @item and @enemy block,
 * with @edit / @remove / @rename applied in the order they were written.
 */
export interface Bible {
  [kind: string]: Record<string, { name: string; aliases: string[]; fields: Record<string, string | string[]>; notes: string[]; sub?: string }>;
}

const SCRIPTED = new Set(["talk", "event", "edit", "remove", "rename", "scene"]);

export function buildBible(scripts: Script[]): Bible {
  const bible: Bible = {};
  const find = (kind: string, name: string) => {
    const table = bible[kind] ?? {};
    return Object.keys(table).find((k) => k === name || table[k].aliases.includes(name) || table[k].fields.id === name);
  };
  const apply = (b: DataBlock) => {
    if (!SCRIPTED.has(b.kind)) {
      const kind = b.kind;
      bible[kind] ??= {};
      bible[kind][b.name] = { name: b.name, aliases: b.aliases, fields: { ...b.fields }, notes: [...b.notes], ...(b.sub ? { sub: b.sub } : {}) };
      return;
    }
    const kind = b.sub ?? "";
    if (b.kind === "edit") {
      const key = find(kind, b.name);
      if (!key) return;
      const entry = bible[kind][key];
      for (const [f, v] of Object.entries(b.fields)) entry.fields[f] = v;
      for (const n of b.notes) {
        const m = n.match(/^([+-])\s*(\w+)(?::\s*(.*))?$/);
        if (m && m[1] === "-") delete entry.fields[m[2]];
        else if (m && m[1] === "+") {
          const prev = entry.fields[m[2]];
          entry.fields[m[2]] = [...(Array.isArray(prev) ? prev : prev ? [prev] : []), m[3] ?? ""];
        } else entry.notes.push(n);
      }
    } else if (b.kind === "remove") {
      const key = find(kind, b.name);
      if (key) delete bible[kind][key];
    } else if (b.kind === "rename") {
      const m = b.name.match(/^(.+?)\s+to\s+(.+)$/);
      const key = m && find(kind, m[1]);
      if (m && key) {
        const entry = bible[kind][key];
        delete bible[kind][key];
        entry.name = m[2];
        bible[kind][m[2]] = entry;
      }
    }
  };
  for (const s of scripts) for (const b of s.blocks) apply(b);
  return bible;
}

export function talkSummary(scripts: Script[]): Array<{ npc: string; when: string }> {
  return scripts.flatMap((s) =>
    s.blocks.filter((b) => b.kind === "talk").map((b) => ({ npc: b.name, when: b.when ? conditionText(b.when) : "default" })),
  );
}
