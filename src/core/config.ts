// Per-project settings. Everything that was hard-wired for one game in the
// old LimOut editor (Miriam as narrator, Stains, MIND blocks) lives here.

export interface CastMember {
  /** Short code id used by exporters (Ren'Py character variable, file names). */
  id: string;
  /** Name shown in the game. Defaults to the cast key in title case. */
  display?: string;
  /** Ren'Py image tag for sprites. Defaults to id. */
  image?: string;
  color?: string;
  aliases?: string[];
  /** Plain-English expression -> engine asset name. */
  expressions?: Record<string, string>;
  /** RPG Maker MV face: [faceName, index]. Moods can override per expression. */
  face?: [string, number];
  faces?: Record<string, [string, number]>;
}

export interface CustomBlockSpec {
  /** Ren'Py label called with the block data in `_intent_data`. */
  renpyLabel?: string;
  /** RPG Maker MV plugin command name; data goes in a script call before it. */
  mvPluginCommand?: string;
  /** Exported or skipped. DRAFT blocks are skipped until approved. */
  export?: boolean;
}

export interface ProjectConfig {
  name: string;
  /** Which exporters to run by default. */
  targets: Array<"renpy" | "mv">;
  /** Speaker of plain lines. null means plain narration with no speaker. */
  narrator: string | null;
  cast: Record<string, CastMember>;
  /** `NAME (as OTHER): line` speaks in OTHER's colour. LimOut's "copying". */
  voiceAs: boolean;
  /** Narrator voices written as `(hollow) line`, mapped to a cast key. */
  voices: Record<string, string>;
  /** What `[[ ... ]]` means inside a line: LimOut stains, or links to blocks. */
  doubleBrackets: "stain" | "link";
  /** Speaker for a line written entirely in curly quotes, e.g. a phone voice. */
  quotedVoice: string | null;
  positions: Record<string, { at: number; short?: string }>;
  /** Plain-English asset names -> engine file names, per kind. */
  assets: {
    bg: Record<string, string>;
    cg: Record<string, string>;
    music: Record<string, string>;
    sound: Record<string, string>;
  };
  /** `>> TYPE:` blocks this project uses (INVESTIGATE, MIND, DEBATE...). */
  blocks: Record<string, CustomBlockSpec>;
  aliases: Record<string, string>;
  renpy: {
    /** Variable for a voice-as speaker, e.g. "{speaker}_as_{as}". */
    voiceAsId: string;
    /** `+ key: value` lines -> Ren'Py statement. {value}, {slug} and {id} are filled in. */
    memory: Record<string, string>;
    labelPrefix: string;
  };
  mv: {
    /** Name box format; Yanfly Message Core style by default. */
    nameFormat: string;
    lineWidth: number;
    linesPerBox: number;
    screenWidth: number;
    screenHeight: number;
    switchStart: number;
    variableStart: number;
    commonEventStart: number;
    /** Known database ids. Unknown names fall back to a lookup by name. */
    switches: Record<string, number>;
    variables: Record<string, number>;
    items: Record<string, number>;
  };
}

export const DEFAULT_POSITIONS: ProjectConfig["positions"] = {
  left: { at: 0.12, short: "L" },
  "center left": { at: 0.31, short: "CL" },
  center: { at: 0.5, short: "C" },
  "center right": { at: 0.69, short: "CR" },
  right: { at: 0.88, short: "R" },
};

export function defaultConfig(): ProjectConfig {
  return {
    name: "Untitled",
    targets: ["renpy", "mv"],
    narrator: null,
    cast: {},
    voiceAs: false,
    voices: {},
    doubleBrackets: "link",
    quotedVoice: null,
    positions: { ...DEFAULT_POSITIONS },
    assets: { bg: {}, cg: {}, music: {}, sound: {} },
    blocks: { DRAFT: { export: false }, MINIGAME: {} },
    aliases: {},
    renpy: { voiceAsId: "{speaker}_as_{as}", memory: {}, labelPrefix: "" },
    mv: {
      nameFormat: "\\n<{name}>",
      lineWidth: 52,
      linesPerBox: 4,
      screenWidth: 816,
      screenHeight: 624,
      switchStart: 101,
      variableStart: 101,
      commonEventStart: 101,
      switches: {},
      variables: {},
      items: {},
    },
  };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function merge(base: any, over: any): any {
  if (!isPlainObject(base) || !isPlainObject(over)) return over === undefined ? base : over;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = merge(base[k], v);
  return out;
}

export function loadConfig(partial: DeepPartial<ProjectConfig> | Record<string, unknown> = {}): ProjectConfig {
  const cfg = merge(defaultConfig(), partial) as ProjectConfig;
  for (const [key, member] of Object.entries(cfg.cast)) {
    member.display ??= key.charAt(0) + key.slice(1).toLowerCase();
    for (const a of member.aliases ?? []) cfg.aliases[a] ??= key;
  }
  for (const [name, p] of Object.entries(cfg.positions)) if (p.short) cfg.aliases[p.short] ??= name;
  return cfg;
}
