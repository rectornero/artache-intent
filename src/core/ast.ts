// The intermediate form every exporter reads. Nothing here is engine-specific.

export type Inline =
  | { t: "text"; v: string }
  | { t: "italic"; v: Inline[] }
  | { t: "slow"; v: Inline[] }
  | { t: "beat" }
  | { t: "stain"; word: string; guess: string; id: string }
  | { t: "link"; target: string; label: string };

export type Cond =
  | { k: "flag"; name: string }
  | { k: "step"; n: number; orMore: boolean }
  | { k: "has"; item: string }
  | { k: "quest"; id: string; state: string }
  | { k: "trust"; who: string; n: number }
  | { k: "first" }
  | { k: "not"; c: Cond }
  | { k: "and"; cs: Cond[] }
  | { k: "or"; cs: Cond[] };

export type SpriteMove =
  | { k: "show" }
  | { k: "enter"; from: string }
  | { k: "exit"; to: string | null; fast: boolean }
  | { k: "move"; to: string };

export type Command =
  | { c: "bg"; name: string; tint?: string; transition: string }
  | { c: "cg"; name: string; transition: string }
  | { c: "black"; transition: string }
  | { c: "music"; name: string | null }
  | { c: "sound"; name: string }
  | { c: "pause"; seconds: number }
  | { c: "shake"; seconds?: number }
  | { c: "fade"; dir: "in" | "out" }
  | {
      c: "sprite";
      who: string;
      expression?: string;
      position?: string;
      move: SpriteMove;
      mods: string[];
      copying?: string;
    }
  | { c: "hide"; who: string }
  | { c: "lineup"; who: string[] }
  | { c: "item"; name: string; delta: number }
  | { c: "gold"; delta: number }
  | { c: "var"; name: string; op: "set" | "add"; value: number }
  | { c: "switch"; name: string; on: boolean }
  | { c: "memory"; key: string; value: string }
  | { c: "quest"; op: "start" | "step" | "done"; id: string; step?: number }
  /** An engine action Intent has no portable meaning for (teleport, battle...). */
  | { c: "action"; verb: string; args: string }
  /** Free description: staged by a person or Claude, listed in the report. */
  | { c: "describe"; text: string };

export interface Option {
  text: string;
  cond?: Cond;
  /** Memory written when picked, e.g. `(+ flag: followed_free)`. */
  effects: Command[];
  body: Node[];
}

export interface CustomItem {
  marker: "*" | "-" | "field";
  key: string;
  mods: string[];
  value: string;
  body: Node[];
}

export type Node =
  | {
      n: "say";
      line: number;
      /** Cast key, or null for plain narration. */
      speaker: string | null;
      as?: string;
      mood?: string;
      text: Inline[];
    }
  | { n: "cmd"; line: number; cmd: Command }
  | { n: "menu"; line: number; prompt?: Inline[]; options: Option[] }
  | { n: "if"; line: number; branches: Array<{ cond: Cond | null; body: Node[] }> }
  | { n: "custom"; line: number; type: string; header: string; items: CustomItem[] }
  | { n: "note"; line: number; text: string }
  | { n: "todo"; line: number; text: string };

export interface Scene {
  id: string;
  title: string;
  line: number;
  body: Node[];
}

export interface Chapter {
  id: string;
  title: string;
  scenes: Scene[];
}

/** A Quest Script style `@kind Name` block. */
export interface DataBlock {
  kind: string;
  sub?: string;
  name: string;
  aliases: string[];
  line: number;
  fields: Record<string, string | string[]>;
  notes: string[];
  /** @talk: the conversation. */
  body?: Node[];
  /** @talk / @event: when: versions, last written wins. */
  when?: Cond | null;
  branches?: Array<{ cond: Cond | null; body: Node[] }>;
}

export interface Diagnostic {
  level: "error" | "warning" | "info";
  line: number;
  message: string;
}

export interface Script {
  file: string;
  chapters: Chapter[];
  blocks: DataBlock[];
  diagnostics: Diagnostic[];
  /** Speakers seen that are not in the cast yet. */
  newSpeakers: string[];
}
