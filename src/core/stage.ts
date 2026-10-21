import type { Command, SpriteMove } from "./ast.ts";
import type { ProjectConfig } from "./config.ts";

const TRANSITIONS = new Set(["fade", "slow", "cut", "dissolve"]);
const TINTS = new Set(["day", "night", "evening"]);
const MODS = new Set(["back", "close", "edge", "faded", "solid", "facing right", "facing left"]);

export interface StageContext {
  cfg: ProjectConfig;
  isCast: (name: string) => string | null;
}

function isPosition(s: string, cfg: ProjectConfig): boolean {
  return s in cfg.positions || /^\d+(\.\d+)?%$/.test(s);
}

/** One `[ ... ]` stage direction. Unknown wording becomes a free description. */
export function parseStage(inner: string, ctx: StageContext): Command {
  const src = inner.trim();
  const [head, ...rest] = src.split(/\s+/);
  const tail = rest.join(" ");
  const parts = tail.split(",").map((s) => s.trim()).filter(Boolean);
  switch (head) {
    case "BG": {
      const words = (parts[0] ?? "").split(/\s+/);
      const tint = TINTS.has(words[words.length - 1]) && words.length > 1 ? words.pop() : undefined;
      const transition = parts.slice(1).find((p) => TRANSITIONS.has(p)) ?? "dissolve";
      return { c: "bg", name: words.join(" "), tint, transition };
    }
    case "CG":
      return { c: "cg", name: parts[0] ?? "", transition: parts.slice(1).find((p) => TRANSITIONS.has(p)) ?? "dissolve" };
    case "BLACK":
      return { c: "black", transition: parts.find((p) => TRANSITIONS.has(p)) ?? "dissolve" };
    case "MUSIC":
      return { c: "music", name: tail === "stop" || tail === "" ? null : tail };
    case "SOUND":
      return { c: "sound", name: tail };
    case "PAUSE":
      return { c: "pause", seconds: Number.parseFloat(tail) || 1 };
    case "SHAKE":
      return { c: "shake", seconds: tail ? Number.parseFloat(tail) : undefined };
    case "HIDE": {
      const who = ctx.isCast(tail);
      if (who) return { c: "hide", who };
      break;
    }
    case "LINEUP": {
      const who = rest.map((w) => ctx.isCast(w));
      if (who.every(Boolean)) return { c: "lineup", who: who as string[] };
      break;
    }
  }
  const who = ctx.isCast(head);
  if (who) {
    const sprite = parseSprite(who, [tail].join(" "), ctx.cfg);
    if (sprite) return sprite;
  }
  return { c: "describe", text: src };
}

function parseSprite(who: string, tail: string, cfg: ProjectConfig): Command | null {
  const cmd: Extract<Command, { c: "sprite" }> = { c: "sprite", who, move: { k: "show" }, mods: [] };
  for (const part of tail.split(",").map((s) => s.trim()).filter(Boolean)) {
    let m: RegExpMatchArray | null;
    if ((m = part.match(/^(?:enters from|in)\s+(.+)$/))) cmd.move = { k: "enter", from: m[1] };
    else if ((m = part.match(/^(?:leaves|out)(?:\s+(.+))?$/))) {
      const fast = m[1] === "fast";
      cmd.move = { k: "exit", to: fast ? null : (m[1] ?? null), fast } as SpriteMove;
    } else if ((m = part.match(/^to\s+(.+)$/))) cmd.move = { k: "move", to: m[1] };
    else if ((m = part.match(/^copying\s+(.+)$/))) cmd.copying = m[1];
    else if (MODS.has(part)) cmd.mods.push(part);
    else if (isPosition(part, cfg)) cmd.position = part;
    else if (/^\S+(\s\S+)?$/.test(part) && !cmd.expression) {
      // "scared" or "scared right" (expression then position, no comma)
      const [e, p] = part.split(" ");
      if (p && !isPosition(p, cfg)) return null;
      cmd.expression = e;
      if (p) cmd.position = p;
    } else return null;
  }
  return cmd;
}

/** Quest Script `! verb args` actions. */
export function parseAction(src: string, ctx: StageContext): Command {
  const s = src.trim();
  let m: RegExpMatchArray | null;
  const qty = (t: string) => {
    const mm = t.match(/^(.*?)\s+x(\d+)$/);
    return mm ? { name: mm[1].trim(), n: Number(mm[2]) } : { name: t.trim(), n: 1 };
  };
  if ((m = s.match(/^give\s+(.+)$/i))) {
    const q = qty(m[1]);
    return { c: "item", name: q.name, delta: q.n };
  }
  if ((m = s.match(/^take\s+(.+)$/i))) {
    const q = qty(m[1]);
    return { c: "item", name: q.name, delta: -q.n };
  }
  if ((m = s.match(/^gold\s+([+-]?\d+)$/i))) return { c: "gold", delta: Number(m[1]) };
  if ((m = s.match(/^step\s+(\d+)$/i))) return { c: "var", name: "Story Step", op: "set", value: Number(m[1]) };
  if ((m = s.match(/^switch\s+(.+?)\s+(on|off)$/i))) return { c: "switch", name: m[1], on: m[2].toLowerCase() === "on" };
  if ((m = s.match(/^quest\s+(start|done)\s+(\S+)$/i)))
    return { c: "quest", op: m[1].toLowerCase() as "start" | "done", id: m[2] };
  if ((m = s.match(/^quest\s+step\s+(\S+)\s+(\d+)$/i))) return { c: "quest", op: "step", id: m[1], step: Number(m[2]) };
  if ((m = s.match(/^trust\s+(.+?)\s+([+-]\d+)$/i))) {
    const who = ctx.isCast(m[1]) ?? m[1];
    return { c: "var", name: `Trust: ${who}`, op: "add", value: Number(m[2]) };
  }
  if ((m = s.match(/^(?:sfx|se)\s+(.+?)(?:\s+x(\d+))?$/i))) return { c: "sound", name: m[1] };
  if ((m = s.match(/^bgm\s+(.+)$/i))) return { c: "music", name: m[1] === "stop" ? null : m[1] };
  if ((m = s.match(/^wait\s+([\d.]+)\s*s?$/i))) return { c: "pause", seconds: Number(m[1]) };
  if ((m = s.match(/^shake(?:\s+([\d.]+)\s*s?)?$/i))) return { c: "shake", seconds: m[1] ? Number(m[1]) : undefined };
  if ((m = s.match(/^fade\s+(in|out)$/i))) return { c: "fade", dir: m[1].toLowerCase() as "in" | "out" };
  const [verb, ...args] = s.split(/\s+/);
  const known = ["move", "face", "balloon", "teleport", "battle", "shop", "erase", "join", "leave"];
  if (known.includes(verb.toLowerCase())) return { c: "action", verb: verb.toLowerCase(), args: args.join(" ") };
  return { c: "describe", text: s };
}

/** LimOut `+ key: value` memory lines. `flag` becomes a switch everywhere. */
export function parseMemory(src: string): Command {
  const m = src.match(/^\s*([\w ]+?)\s*:\s*(.+)$/);
  if (!m) return { c: "describe", text: `+ ${src}` };
  const key = m[1].trim().toLowerCase();
  const value = m[2].trim();
  if (key === "flag") return { c: "switch", name: value, on: true };
  return { c: "memory", key, value };
}
