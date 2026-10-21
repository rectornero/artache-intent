import type { Chapter, Command, CustomItem, DataBlock, Diagnostic, Node, Option, Scene, Script } from "./ast.ts";
import { parseCondition } from "./condition.ts";
import type { ProjectConfig } from "./config.ts";
import { parseInline } from "./inline.ts";
import { parseAction, parseMemory, parseStage, type StageContext } from "./stage.ts";

/** One source line with the lines indented under it. */
interface Line {
  text: string;
  line: number;
  indent: number;
  children: Line[];
}

const RESERVED = new Set(["BG", "CG", "BLACK", "MUSIC", "SOUND", "PAUSE", "SHAKE", "HIDE", "IF", "ELSE", "END", "TODO", "LINEUP"]);
const DATA_KINDS = new Set(["npc", "talk", "route", "event", "quest", "map", "item", "enemy", "edit", "remove", "rename", "scene"]);

export function slug(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function indentOf(raw: string): number {
  let n = 0;
  for (const ch of raw) {
    if (ch === " ") n++;
    else if (ch === "\t") n += 4;
    else break;
  }
  return n;
}

/** Strip a trailing `// note`, but not the `//` inside a URL. */
function stripTrailingNote(text: string): string {
  const m = text.match(/^(.*?\S)\s+\/\/(?!\S*:\/\/).*$/);
  return m ? m[1] : text;
}

function buildTree(lines: Array<{ text: string; line: number }>): Line[] {
  const root: Line = { text: "", line: 0, indent: -1, children: [] };
  const stack: Line[] = [root];
  for (const { text, line } of lines) {
    if (!text.trim()) continue;
    const node: Line = { text: text.trim(), line, indent: indentOf(text), children: [] };
    while (stack.length > 1 && stack[stack.length - 1].indent >= node.indent) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root.children;
}

export class Parser {
  private diagnostics: Diagnostic[] = [];
  private newSpeakers = new Set<string>();
  private stainCount = 0;
  private aliases: Record<string, string>;
  private macros = new Map<string, string[]>();
  private cast: Map<string, string>;
  private stage: StageContext;
  private lastSpeaker: { speaker: string | null; as?: string; mood?: string } = { speaker: null };

  constructor(
    private cfg: ProjectConfig,
    private file = "script.intent",
  ) {
    this.aliases = { ...cfg.aliases };
    this.cast = new Map(Object.keys(cfg.cast).map((k) => [k.toUpperCase(), k]));
    this.stage = { cfg, isCast: (n) => this.castKey(n) };
  }

  private warn(line: number, message: string, level: Diagnostic["level"] = "warning") {
    this.diagnostics.push({ level, line, message });
  }

  /** Resolve aliases word by word. Multi-word aliases match whole phrases. */
  private resolve(s: string): string {
    const keys = Object.keys(this.aliases).sort((a, b) => b.length - a.length);
    if (!keys.length) return s;
    const esc = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`(?<![\\w'’])(${esc.join("|")})(?![\\w'’])`, "g");
    return s.replace(re, (k) => this.aliases[k]);
  }

  private castKey(name: string): string | null {
    const n = this.resolve(name.trim());
    return this.cast.get(n.toUpperCase()) ?? null;
  }

  parse(source: string): Script {
    const lines = this.preprocess(source);
    const chapters: Chapter[] = [];
    const blocks: DataBlock[] = [];
    let chapter: Chapter | null = null;
    let scene: Scene | null = null;
    let pending: Array<{ text: string; line: number }> = [];

    const flushScene = () => {
      if (!pending.some((p) => p.text.trim())) {
        pending = [];
        return;
      }
      if (!scene) {
        if (!chapter) {
          chapter = { id: slug(this.file.replace(/\.[^.]+$/, "")) || "main", title: this.file.replace(/\.[^.]+$/, ""), scenes: [] };
          chapters.push(chapter);
        }
        scene = { id: `${chapter.id}_start`, title: "", line: pending[0].line, body: [] };
        chapter.scenes.push(scene);
      }
      scene.body.push(...this.parseBody(buildTree(pending)));
      pending = [];
    };

    // First pass: names declared by @npc blocks count as cast.
    for (const { text } of lines) {
      const m = text.match(/^@npc\s+(.+?)(?:\s+aka\s+(\S+))?(?:\s*:.*)?$/);
      if (m) {
        const name = m[1].trim();
        if (!this.castKey(name)) this.cast.set(name.toUpperCase(), name);
        if (m[2]) this.aliases[m[2]] ??= name;
      }
      const a = text.match(/^@(?:map|event|item|enemy|quest(?:\s+\w+)?)\s+(.+?)\s+aka\s+(\S+)/);
      if (a) this.aliases[a[2]] ??= a[1].trim();
    }

    let i = 0;
    while (i < lines.length) {
      const { text, line } = lines[i];
      const t = text.trim();
      const top = indentOf(text) === 0;
      let m: RegExpMatchArray | null;
      if (top && (m = t.match(/^#\s+(.+)$/))) {
        flushScene();
        const title = m[1].trim();
        chapter = { id: slug(title.replace(/\s*·.*$/, "")) || `chapter_${chapters.length + 1}`, title, scenes: [] };
        chapters.push(chapter);
        scene = null;
        i++;
        continue;
      }
      if (top && (m = t.match(/^##\s+(.+)$/))) {
        flushScene();
        if (!chapter) {
          chapter = { id: slug(this.file.replace(/\.[^.]+$/, "")) || "main", title: this.file.replace(/\.[^.]+$/, ""), scenes: [] };
          chapters.push(chapter);
        }
        const title = m[1].trim();
        scene = { id: `${chapter.id}_${slug(title)}`, title, line, body: [] };
        chapter.scenes.push(scene);
        i++;
        continue;
      }
      if (top && (m = t.match(/^@(\w+)\b/)) && DATA_KINDS.has(m[1])) {
        flushScene();
        const group = [lines[i]];
        i++;
        while (i < lines.length && (indentOf(lines[i].text) > 0 || !lines[i].text.trim())) group.push(lines[i++]);
        const [head] = buildTree(group);
        if (head) blocks.push(this.parseBlock(head));
        continue;
      }
      pending.push(lines[i]);
      i++;
    }
    flushScene();

    return {
      file: this.file,
      chapters,
      blocks,
      diagnostics: this.diagnostics,
      newSpeakers: [...this.newSpeakers],
    };
  }

  /** Remove notes, collect @alias/@aka and @macro, expand macro calls. */
  private preprocess(source: string): Array<{ text: string; line: number }> {
    const raw = source.replace(/\r\n?/g, "\n").split("\n");
    const out: Array<{ text: string; line: number }> = [];
    let macro: { name: string; body: string[] } | null = null;
    raw.forEach((text, idx) => {
      const line = idx + 1;
      const t = text.trim();
      if (macro) {
        if (t === "@end") {
          this.macros.set(macro.name, macro.body);
          macro = null;
        } else macro.body.push(text);
        return;
      }
      let m: RegExpMatchArray | null;
      if ((m = t.match(/^@macro\s+(\S+)$/))) {
        macro = { name: m[1], body: [] };
        return;
      }
      if ((m = t.match(/^@(?:alias|aka)\s+(.+?)\s*=\s*(.+)$/))) {
        const short = m[1].trim();
        if (RESERVED.has(short)) this.warn(line, `"${short}" is a reserved word and can't be an alias`, "error");
        else {
          if (this.aliases[short] && this.aliases[short] !== m[2].trim())
            this.warn(line, `Alias "${short}" now means "${m[2].trim()}" (was "${this.aliases[short]}")`, "info");
          this.aliases[short] = m[2].trim();
        }
        return;
      }
      if (t.startsWith("//")) return;
      if ((m = t.match(/^@(\w+)$/)) && this.macros.has(m[1])) {
        const pad = text.slice(0, indentOf(text));
        for (const b of this.macros.get(m[1])!) out.push({ text: pad + b, line });
        return;
      }
      if (/^@\w+$/.test(t) && !DATA_KINDS.has(t.slice(1)) && t !== "@end")
        this.warn(line, `Unknown shortcut ${t}`, "error");
      out.push({ text: stripTrailingNote(text), line });
    });
    if (macro) this.warn(raw.length, `@macro ${(macro as { name: string }).name} has no @end`, "error");
    return out;
  }

  private inline(text: string) {
    return parseInline(text, {
      doubleBrackets: this.cfg.doubleBrackets,
      nextStainId: () => `${slug(this.file.replace(/\.[^.]+$/, ""))}_s${++this.stainCount}`,
    });
  }

  parseBody(lines: Line[]): Node[] {
    const out: Node[] = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      const t = l.text;
      let m: RegExpMatchArray | null;

      if (t.startsWith("~ ") || t === "~") {
        out.push({ n: "note", line: l.line, text: t.slice(1).trim() });
      } else if ((m = t.match(/^TODO:?\s*(.*)$/))) {
        out.push({ n: "todo", line: l.line, text: m[1] });
        this.warn(l.line, `TODO: ${m[1]}`, "info");
      } else if ((m = t.match(/^IF\s+(.+)$/))) {
        const branches: Array<{ cond: ReturnType<typeof parseCondition> | null; body: Node[] }> = [
          { cond: parseCondition(this.resolve(m[1])), body: this.parseBody(l.children) },
        ];
        while (i + 1 < lines.length && /^(ELSE IF\s+.+|ELSE)$/.test(lines[i + 1].text)) {
          const e = lines[++i];
          const em = e.text.match(/^ELSE IF\s+(.+)$/);
          branches.push({ cond: em ? parseCondition(this.resolve(em[1])) : null, body: this.parseBody(e.children) });
        }
        if (i + 1 < lines.length && lines[i + 1].text === "END") i++;
        else this.warn(l.line, "IF without END", "info");
        out.push({ n: "if", line: l.line, branches });
      } else if (t === "END" || t === "ELSE") {
        this.warn(l.line, `${t} without IF`, "error");
      } else if ((m = t.match(/^when:\s*(.+)$/))) {
        out.push({ n: "if", line: l.line, branches: [{ cond: parseCondition(this.resolve(m[1])), body: this.parseBody(l.children) }] });
      } else if (t.startsWith("?") || t.startsWith("> ") || t === ">") {
        i = this.parseMenu(lines, i, out);
        continue;
      } else if ((m = t.match(/^>>\s*([A-Z][A-Z ]*?)\s*(?::\s*(.*))?$/))) {
        out.push(this.parseCustom(l, m[1].trim(), m[2] ?? ""));
      } else if (t.startsWith("+ ")) {
        out.push({ n: "cmd", line: l.line, cmd: parseMemory(this.resolve(t.slice(2))) });
      } else if (t.startsWith("! ")) {
        const cmd = parseAction(this.resolve(t.slice(2)), this.stage);
        if (cmd.c === "describe") this.warn(l.line, `Free action, staged by hand: ${cmd.text}`, "info");
        out.push({ n: "cmd", line: l.line, cmd });
      } else if (this.isStageLine(t)) {
        for (const g of t.match(/\[[^\]]*\]/g) ?? []) {
          const cmd = parseStage(this.resolve(g.slice(1, -1)), this.stage);
          if (cmd.c === "describe") this.warn(l.line, `Free description, staged by hand: ${cmd.text}`, "info");
          out.push({ n: "cmd", line: l.line, cmd });
        }
      } else {
        const say = this.parseSay(t, l.line);
        if (say) out.push(say);
      }
      if (l.children.length && !/^(IF|when:|>>)/.test(t)) {
        // Indented lines under an ordinary line just continue the flow.
        out.push(...this.parseBody(l.children));
      }
      i++;
    }
    return out;
  }

  private isStageLine(t: string): boolean {
    return t.startsWith("[") && !t.startsWith("[[") && /^(\s*\[[^\]]*\]\s*)+$/.test(t);
  }

  private parseSay(t: string, line: number): Node | null {
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^-\s+(.+)$/))) {
      return { n: "say", line, ...this.lastSpeaker, text: this.inline(m[1]) };
    }
    if (this.cfg.quotedVoice && (m = t.match(/^“([^”]*)”$/))) {
      return { n: "say", line, speaker: this.cfg.quotedVoice, text: this.inline(m[1]) };
    }
    // (as FREE) line / (hollow) line: the narrator with a voice.
    if ((m = t.match(/^\(([^)]+)\)\s+(.+)$/))) {
      const who = this.speakerMods(this.cfg.narrator, m[1], line);
      this.lastSpeaker = who;
      return { n: "say", line, ...who, text: this.inline(m[2]) };
    }
    // NAME: line, NAME (mood): line, M(F): line
    if ((m = t.match(/^([^:()\[\]]{1,30}?)\s*(?:\(([^)]*)\))?\s*:\s+(.+)$/))) {
      const rawName = m[1].trim();
      let key = this.castKey(rawName);
      const looksLikeName = /^[A-Z][A-Z0-9_ .'-]*$/.test(rawName) && !RESERVED.has(rawName);
      if (!key && looksLikeName && /^[A-Z]{2,}/.test(rawName)) {
        key = rawName;
        this.cast.set(rawName, rawName);
        this.newSpeakers.add(rawName);
        this.warn(line, `New character ${rawName}: add them to the cast with a colour`, "warning");
      }
      if (key) {
        const who = m[2] ? this.speakerMods(key, m[2], line) : { speaker: key };
        this.lastSpeaker = who;
        return { n: "say", line, ...who, text: this.inline(m[3]) };
      }
    }
    this.lastSpeaker = { speaker: this.cfg.narrator };
    return { n: "say", line, speaker: this.cfg.narrator, text: this.inline(t) };
  }

  private speakerMods(speaker: string | null, mod: string, line: number) {
    const s = this.resolve(mod.trim());
    if (this.cfg.voices[s]) return { speaker: this.cfg.voices[s] };
    const asm = s.match(/^as\s+(.+)$/);
    const target = asm ? this.castKey(asm[1]) : this.castKey(s);
    if ((asm || target) && this.cfg.voiceAs) {
      if (!target) this.warn(line, `Unknown character in (${mod})`, "error");
      return { speaker, as: target ?? asm![1] };
    }
    return { speaker, mood: s };
  }

  /** `? prompt` + `> option` (LimOut) or consecutive `? option` (Quest Script). */
  private parseMenu(lines: Line[], i: number, out: Node[]): number {
    const first = lines[i];
    const options: Option[] = [];
    let prompt: ReturnType<Parser["inline"]> | undefined;
    const option = (l: Line, text: string): Option => {
      const effects: Command[] = [];
      let label = text;
      let cond;
      const eff = label.match(/^(.*?)\s*\(\+\s*([^)]*)\)\s*$/);
      if (eff) {
        label = eff[1];
        effects.push(parseMemory(this.resolve(eff[2])));
      }
      const wm = label.match(/^(.*?)\s+when:\s*(.+)$/);
      if (wm) {
        label = wm[1];
        cond = parseCondition(this.resolve(wm[2]));
      }
      return { text: label.trim(), cond, effects, body: this.parseBody(l.children) };
    };
    const firstText = first.text.replace(/^\?\s*/, "");
    const nextIsArrow = i + 1 < lines.length && lines[i + 1].text.startsWith(">");
    if (first.text.startsWith("?") && !first.children.length && nextIsArrow) {
      prompt = this.inline(firstText);
      i++;
    } else if (first.text.startsWith("?") && first.children.every((c) => c.text.startsWith(">"))
      && first.children.length) {
      prompt = this.inline(firstText);
      for (const c of first.children) options.push(option(c, c.text.replace(/^>\s*/, "")));
      out.push({ n: "menu", line: first.line, prompt, options });
      return i + 1;
    }
    const marker = lines[i].text.startsWith(">") ? ">" : "?";
    while (i < lines.length && lines[i].text.startsWith(marker) && !lines[i].text.startsWith(">>")) {
      options.push(option(lines[i], lines[i].text.slice(1).trim()));
      i++;
    }
    out.push({ n: "menu", line: first.line, prompt, options });
    return i;
  }

  private parseCustom(l: Line, type: string, header: string): Node {
    if (!(type in this.cfg.blocks)) this.warn(l.line, `>> ${type} is not set up for this project; it will export as a generic block`);
    const items: CustomItem[] = l.children.map((c) => {
      let m = c.text.match(/^([*-])\s+(.*)$/);
      const marker = (m ? m[1] : "field") as CustomItem["marker"];
      const rest = m ? m[2] : c.text;
      m = rest.match(/^([^:()]+?)\s*(?:\(([^)]*)\))?\s*(?::\s*(.*))?$/);
      const key = m ? m[1].trim() : rest;
      const mods = m?.[2] ? m[2].split(",").map((s) => s.trim()) : [];
      return { marker, key, mods, value: m?.[3]?.trim() ?? "", body: this.parseBody(c.children) };
    });
    return { n: "custom", line: l.line, type, header, items };
  }

  private parseBlock(head: Line): DataBlock {
    const m = head.text.match(/^@(\w+)\s*(.*)$/)!;
    const kind = m[1];
    let rest = m[2];
    let sub: string | undefined;
    if (kind === "quest" || kind === "edit" || kind === "remove" || kind === "rename") {
      const sm = rest.match(/^(\w+)\s+(.*)$/);
      if (sm) [sub, rest] = [sm[1], sm[2]];
    }
    const fields: Record<string, string | string[]> = {};
    const notes: string[] = [];
    // Inline fields on the header: `@talk Lena when: step 1000`, `@event Oak at: [[R1]]`
    const inl = rest.match(/^(.*?)\s+(\w+):\s*(.*)$/);
    if (inl && inl[1]) {
      rest = inl[1];
      fields[inl[2]] = inl[3];
    } else {
      const desc = rest.match(/^([^:]+):\s*(.+)$/);
      if (desc) {
        rest = desc[1];
        fields.description = desc[2];
      }
    }
    const akaM = rest.match(/^(.*?)\s+aka\s+(\S+)$/);
    let name = (akaM ? akaM[1] : rest).trim();
    if (kind !== "rename") name = this.castKey(name) ?? this.resolve(name);
    const block: DataBlock = { kind, sub, name, aliases: akaM ? [akaM[2]] : [], line: head.line, fields, notes };

    const script: Line[] = [];
    const branches: Array<{ cond: ReturnType<typeof parseCondition> | null; body: Node[] }> = [];
    for (const c of head.children) {
      const fm = c.text.match(/^([a-z][\w ]*?):\s*(.*)$/);
      if (c.text.startsWith("~")) notes.push(c.text.slice(1).trim());
      else if (fm && fm[1] === "when" && (kind === "event" || kind === "talk")) {
        branches.push({ cond: parseCondition(this.resolve(fm[2])), body: this.parseBody(c.children) });
      } else if (fm && kind !== "talk") {
        fields[fm[1]] = c.children.length ? [fm[2], ...c.children.map((x) => x.text)].filter(Boolean) : fm[2];
      } else script.push(c);
    }
    if (kind === "talk") {
      this.lastSpeaker = { speaker: this.castKey(name) ?? name };
      block.when = typeof fields.when === "string" ? parseCondition(this.resolve(fields.when)) : null;
      block.body = this.parseBody(script);
      if (branches.length) block.branches = branches;
    } else if (kind === "event") {
      if (script.length) branches.unshift({ cond: null, body: this.parseBody(script) });
      block.branches = branches;
    } else if (script.length) {
      for (const s of script) notes.push(s.text);
    }
    return block;
  }
}

export function parseScript(source: string, cfg: ProjectConfig, file = "script.intent"): Script {
  return new Parser(cfg, file).parse(source);
}
