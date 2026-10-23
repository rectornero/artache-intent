// The MV version of a script: its RPG Maker MV common events as JSON, one
// command per line, for hand-tuning like Ren'Py Code. The file also keeps the
// switch and variable names its ids stood for, so Export can put a hand-tuned
// version back into the project even after other scripts moved the ids on.

import type { MvCommand, MvCommonEvent, MvOutput } from "../exporters/mv.ts";

export interface MvVersion {
  about?: string;
  /** Every common event's name by id, when this version was made: calls to other scripts' events follow by name. */
  events?: Record<string, string>;
  switches: Record<string, string>;
  variables: Record<string, string>;
  commonEvents: MvCommonEvent[];
}

/** One script's events from the project's MV export, as the text of its MV version. */
export function mvVersionText(mv: MvOutput, script: string): string {
  const events = mv.commonEvents.filter((e) => mv.owners[e.id] === script);
  return formatMv({
    about: `MV version of ${script}: its common events as RPG Maker MV runs them. Edit them by hand if you like; Export uses this text while it is in step with Play.`,
    events: Object.fromEntries(mv.commonEvents.map((e) => [e.id, e.name])),
    switches: { ...mv.switches },
    variables: { ...mv.variables },
    commonEvents: events,
  });
}

/** JSON a person can read and edit: one event command per line. */
export function formatMv(v: MvVersion): string {
  const ev = (e: MvCommonEvent) => {
    const { list, ...head } = e;
    const h = JSON.stringify(head).slice(0, -1);
    return `  ${h}, "list": [\n${list.map((c) => `    ${JSON.stringify(c)}`).join(",\n")}\n  ]}`;
  };
  return [
    "{",
    ...(v.about ? [` "about": ${JSON.stringify(v.about)},`] : []),
    ...(v.events ? [` "events": ${JSON.stringify(v.events)},`] : []),
    ` "switches": ${JSON.stringify(v.switches)},`,
    ` "variables": ${JSON.stringify(v.variables)},`,
    ` "commonEvents": [`,
    v.commonEvents.map(ev).join(",\n"),
    " ]",
    "}",
    "",
  ].join("\n");
}

export function parseMv(text: string): MvVersion {
  const v = JSON.parse(text) as Partial<MvVersion>;
  if (!Array.isArray(v.commonEvents)) throw new Error("An MV version needs a commonEvents list.");
  return { events: v.events ?? {}, switches: v.switches ?? {}, variables: v.variables ?? {}, commonEvents: v.commonEvents };
}

type IdMap = (id: number) => number;

/** Re-point a command's switch, variable and common-event ids. */
function remap(c: MvCommand, sw: IdMap, va: IdMap, ce: IdMap): MvCommand {
  const p = [...c.parameters] as Array<number | unknown>;
  const n = (i: number, f: IdMap) => typeof p[i] === "number" && (p[i] = f(p[i] as number));
  switch (c.code) {
    case 117: n(0, ce); break;
    case 121: if (p[0] === p[1]) { n(0, sw); p[1] = p[0]; } break;
    case 122:
      if (p[0] === p[1]) { n(0, va); p[1] = p[0]; }
      if (p[3] === 1) n(4, va);
      break;
    case 111:
      if (p[0] === 0) n(1, sw);
      if (p[0] === 1) { n(1, va); if (p[2] === 1) n(3, va); }
      break;
  }
  return { ...c, parameters: p };
}

/**
 * The project's MV export with hand-tuned MV versions put back: each script's events
 * replaced by its MV version's events, matched by name and given the export's ids.
 * Events the writer added get new ids at the end; ids inside them follow by name.
 */
export function withMvVersions(mv: MvOutput, versions: Record<string, string>): { commonEvents: MvCommonEvent[]; switches: Record<number, string>; variables: Record<number, string>; problems: string[] } {
  const problems: string[] = [];
  const switches = { ...mv.switches };
  const variables = { ...mv.variables };
  let events = [...mv.commonEvents];
  let nextCe = Math.max(0, ...events.map((e) => e.id)) + 1;
  const idByName = (table: Record<number, string>) => (name: string | undefined, fallback: number) => {
    if (name === undefined) return fallback;
    const hit = Object.entries(table).find(([, n]) => n === name);
    if (hit) return Number(hit[0]);
    const id = Math.max(0, ...Object.keys(table).map(Number)) + 1;
    table[id] = name;
    return id;
  };
  const swId = idByName(switches), vaId = idByName(variables);

  for (const [script, text] of Object.entries(versions)) {
    let v: MvVersion;
    try {
      v = parseMv(text);
    } catch (e) {
      problems.push(`${script}: the MV version isn't valid (${e instanceof Error ? e.message : String(e)}), so its events come from Play.`);
      continue;
    }
    const mine = events.filter((e) => mv.owners[e.id] === script);
    const byName = new Map(mine.map((e) => [e.name, e.id]));
    const ceMap = new Map<number, number>();
    for (const e of v.commonEvents) ceMap.set(e.id, byName.get(e.name) ?? nextCe++);
    const sw: IdMap = (id) => swId(v.switches[id], id);
    const va: IdMap = (id) => vaId(v.variables[id], id);
    // A call to another script's event: find that event by the name it had.
    const ce: IdMap = (id) => ceMap.get(id) ?? (v.events?.[id] !== undefined ? events.find((e) => e.name === v.events![id])?.id : undefined) ?? id;
    const tuned = v.commonEvents.map((e) => ({ ...e, id: ceMap.get(e.id)!, list: e.list.map((c) => remap(c, sw, va, ce)) }));
    events = [...events.filter((e) => mv.owners[e.id] !== script), ...tuned];
  }
  events.sort((a, b) => a.id - b.id);
  return { commonEvents: events, switches, variables, problems };
}
