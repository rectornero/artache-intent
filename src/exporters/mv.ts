import type { Command, Cond, DataBlock, Inline, Node, Script } from "../core/ast.ts";
import type { ProjectConfig } from "../core/config.ts";
import { slug } from "../core/parser.ts";
import { addMissing, newReport, type Report } from "./report.ts";
import { paragraphs } from "./renpy.ts";

// RPG Maker MV event commands are { code, indent, parameters }. Codes used here:
// 101/401 text, 102/402/404 choices, 111/411/412 conditional branch, 117 common event,
// 121 switch, 122 variable, 125 gold, 126 item, 108/408 comment, 221/222 fade,
// 225 shake, 230 wait, 231/232/235 pictures, 241/242 BGM, 250 SE, 355/655 script, 356 plugin.

export interface MvCommand {
  code: number;
  indent: number;
  parameters: unknown[];
}

export interface MvCommonEvent {
  id: number;
  name: string;
  trigger: 0;
  switchId: 1;
  list: MvCommand[];
}

export interface MvOutput {
  commonEvents: MvCommonEvent[];
  mapEvents: Record<string, unknown>[];
  switches: Record<number, string>;
  variables: Record<number, string>;
  report: Report;
}

function cmd(code: number, indent: number, parameters: unknown[] = []): MvCommand {
  return { code, indent, parameters };
}

export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && (line + " " + word).replace(/\\n<[^>]*>|\\[A-Za-z]+\[\d*\]|\\[.|!><{}^$]/g, "").length > width) {
        out.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out;
}

export class MvExporter {
  report = newReport();
  commonEvents: MvCommonEvent[] = [];
  mapEvents: Record<string, unknown>[] = [];
  private switches = new Map<string, number>();
  private variables = new Map<string, number>();
  private nextSwitch: number;
  private nextVar: number;
  private nextCe: number;
  private pictures = new Map<string, number>();

  constructor(private cfg: ProjectConfig) {
    this.nextSwitch = cfg.mv.switchStart;
    this.nextVar = cfg.mv.variableStart;
    this.nextCe = cfg.mv.commonEventStart;
    for (const [n, id] of Object.entries(cfg.mv.switches)) this.switches.set(n, id);
    for (const [n, id] of Object.entries(cfg.mv.variables)) this.variables.set(n, id);
  }

  switchId(name: string): number {
    if (!this.switches.has(name)) {
      while ([...this.switches.values()].includes(this.nextSwitch)) this.nextSwitch++;
      this.switches.set(name, this.nextSwitch++);
    }
    return this.switches.get(name)!;
  }

  varId(name: string): number {
    if (!this.variables.has(name)) {
      while ([...this.variables.values()].includes(this.nextVar)) this.nextVar++;
      this.variables.set(name, this.nextVar++);
    }
    return this.variables.get(name)!;
  }

  private itemJs(name: string): string {
    const id = this.cfg.mv.items[name];
    return id ? `$dataItems[${id}]` : `$dataItems.find(function(i){return i&&i.name===${JSON.stringify(name)};})`;
  }

  private asset(kind: "bg" | "cg" | "music" | "sound", name: string, line: number): string {
    const mapped = this.cfg.assets[kind][name];
    if (mapped) return mapped;
    addMissing(this.report, kind, name, line);
    return name;
  }

  text(parts: Inline[]): string {
    return parts
      .map((p) => {
        switch (p.t) {
          case "text":
            return p.v;
          case "italic":
          case "slow":
            return this.text(p.v);
          case "beat":
            return "\\.";
          case "stain":
            return `\\C[2]${p.word}\\C[0]`;
          case "link":
            return p.label;
        }
      })
      .join("");
  }

  condJs(c: Cond): string {
    switch (c.k) {
      case "flag":
        return `$gameSwitches.value(${this.switchId(c.name)})`;
      case "step":
        return `$gameVariables.value(${this.varId("Story Step")}) ${c.orMore ? ">=" : "==="} ${c.n}`;
      case "has":
        return `$gameParty.hasItem(${this.itemJs(c.item)})`;
      case "quest":
        return `$gameVariables.value(${this.varId(`Quest: ${c.id}`)}) === ${c.state === "done" ? 2 : c.state === "active" ? 1 : 0}`;
      case "trust":
        return `$gameVariables.value(${this.varId(`Trust: ${c.who}`)}) >= ${c.n}`;
      case "first":
        return "true";
      case "not":
        return `!(${this.condJs(c.c)})`;
      case "and":
        return c.cs.map((x) => `(${this.condJs(x)})`).join(" && ");
      case "or":
        return c.cs.map((x) => `(${this.condJs(x)})`).join(" || ");
    }
  }

  /** Native condition parameters where MV has one, otherwise a script condition. */
  condParams(c: Cond): unknown[] {
    if (c.k === "flag") return [0, this.switchId(c.name), 0];
    if (c.k === "not" && c.c.k === "flag") return [0, this.switchId(c.c.name), 1];
    if (c.k === "step") return [1, this.varId("Story Step"), 0, c.n, c.orMore ? 1 : 0];
    if (c.k === "trust") return [1, this.varId(`Trust: ${c.who}`), 0, c.n, 1];
    if (c.k === "has" && this.cfg.mv.items[c.item]) return [8, this.cfg.mv.items[c.item]];
    return [12, this.condJs(c)];
  }

  private say(lines: MvCommand[], ind: number, speaker: string | null, _as: string | undefined, mood: string | undefined, text: string) {
    const member = speaker ? this.cfg.cast[speaker] : undefined;
    const face = (mood && member?.faces?.[mood]) || member?.face || ["", 0];
    if (speaker && !member) addMissing(this.report, "cast (no face or name settings)", speaker);
    else if (mood && member && !member.faces?.[mood]) addMissing(this.report, `face ${speaker}`, mood);
    const name = member ? this.cfg.mv.nameFormat.replace("{name}", member.display ?? speaker!) : speaker ? this.cfg.mv.nameFormat.replace("{name}", speaker) : "";
    const rows = wrap(text, this.cfg.mv.lineWidth);
    for (let k = 0; k < rows.length; k += this.cfg.mv.linesPerBox) {
      lines.push(cmd(101, ind, [face[0], face[1], 0, 2]));
      rows.slice(k, k + this.cfg.mv.linesPerBox).forEach((r, j) => lines.push(cmd(401, ind, [j === 0 && name ? `${name}${r}` : r])));
    }
  }

  private picture(who: string): number {
    if (!this.pictures.has(who)) this.pictures.set(who, 10 + this.pictures.size);
    return this.pictures.get(who)!;
  }

  private posX(name: string | undefined): number {
    const p = name ? this.cfg.positions[name] : undefined;
    const at = p ? p.at : name ? Number.parseFloat(name) / 100 || 0.5 : 0.5;
    return Math.round(at * this.cfg.mv.screenWidth);
  }

  command(c: Command, line: number, ind: number, out: MvCommand[]) {
    const h = this.cfg.mv.screenHeight;
    const w = this.cfg.mv.screenWidth;
    const comment = (text: string) => out.push(cmd(108, ind, [text]));
    switch (c.c) {
      case "bg":
      case "cg": {
        const name = this.asset(c.c, c.c === "bg" && c.tint ? `${c.name} ${c.tint}` : c.name, line);
        if (c.transition === "fade") out.push(cmd(221, ind));
        out.push(cmd(231, ind, [1, name, 0, 0, 0, 0, 100, 100, 255, 0]));
        if (c.transition === "fade") out.push(cmd(222, ind));
        return;
      }
      case "black":
        out.push(cmd(221, ind), cmd(235, ind, [1]));
        return;
      case "music":
        if (c.name) out.push(cmd(241, ind, [{ name: this.asset("music", c.name, line), volume: 90, pitch: 100, pan: 0 }]));
        else out.push(cmd(242, ind, [2]));
        return;
      case "sound":
        out.push(cmd(250, ind, [{ name: this.asset("sound", c.name, line), volume: 90, pitch: 100, pan: 0 }]));
        return;
      case "pause":
        out.push(cmd(230, ind, [Math.round(c.seconds * 60)]));
        return;
      case "shake":
        out.push(cmd(225, ind, [5, 5, Math.round((c.seconds ?? 0.5) * 60), true]));
        return;
      case "fade":
        out.push(cmd(c.dir === "out" ? 221 : 222, ind));
        return;
      case "sprite": {
        const pic = this.picture(c.who);
        const id = this.cfg.cast[c.who]?.id ?? slug(c.who);
        const expr = c.copying ? `copying ${c.copying}` : c.expression;
        const mapped = expr ? this.cfg.cast[c.who]?.expressions?.[expr] : undefined;
        if (expr && !mapped) addMissing(this.report, `sprite ${c.who}`, expr, line);
        const name = `${id}_${slug(mapped ?? expr ?? "neutral")}`;
        const opacity = c.mods.includes("faded") ? 90 : 255;
        const zoom = c.mods.includes("back") ? 85 : c.mods.includes("close") ? 135 : 100;
        const y = Math.round(h * 0.62);
        if (c.move.k === "exit") {
          out.push(cmd(232, ind, [pic, 0, 1, 0, c.move.fast ? this.posX("right") : this.posX(c.move.to ?? undefined), y, 100, 100, 0, 0, c.move.fast ? 8 : 20, true]));
          out.push(cmd(235, ind, [pic]));
        } else if (c.move.k === "enter") {
          const from = c.move.from;
          out.push(cmd(231, ind, [pic, name, 1, 0, this.posX(from) < w / 2 ? -100 : w + 100, y, zoom, zoom, opacity, 0]));
          out.push(cmd(232, ind, [pic, 0, 1, 0, this.posX(c.position ?? from), y, zoom, zoom, opacity, 0, 24, true]));
        } else if (c.move.k === "move") {
          out.push(cmd(232, ind, [pic, 0, 1, 0, this.posX(c.move.to), y, zoom, zoom, opacity, 0, 30, true]));
        } else {
          out.push(cmd(231, ind, [pic, name, 1, 0, this.posX(c.position), y, zoom, zoom, opacity, 0]));
        }
        return;
      }
      case "hide":
        out.push(cmd(235, ind, [this.picture(c.who)]));
        return;
      case "lineup":
        c.who.forEach((who, k) => {
          const id = this.cfg.cast[who]?.id ?? slug(who);
          const x = Math.round(((k + 1) / (c.who.length + 1)) * w);
          out.push(cmd(231, ind, [this.picture(who), `${id}_neutral`, 1, 0, x, Math.round(h * 0.62), 100, 100, 255, 0]));
        });
        return;
      case "item": {
        const id = this.cfg.mv.items[c.name];
        if (id) out.push(cmd(126, ind, [id, c.delta >= 0 ? 0 : 1, 0, Math.abs(c.delta)]));
        else out.push(cmd(355, ind, [`$gameParty.gainItem(${this.itemJs(c.name)}, ${c.delta});`]));
        return;
      }
      case "gold":
        out.push(cmd(125, ind, [c.delta >= 0 ? 0 : 1, 0, Math.abs(c.delta)]));
        return;
      case "var": {
        const id = this.varId(c.name);
        out.push(cmd(122, ind, [id, id, c.op === "set" ? 0 : 1, 0, c.value]));
        return;
      }
      case "switch": {
        const id = this.switchId(c.name);
        out.push(cmd(121, ind, [id, id, c.on ? 0 : 1]));
        return;
      }
      case "memory": {
        const id = this.switchId(`${c.key}: ${c.value}`);
        out.push(cmd(121, ind, [id, id, 0]));
        return;
      }
      case "quest": {
        if (c.op === "step") {
          const id = this.varId(`Quest step: ${c.id}`);
          out.push(cmd(122, ind, [id, id, 0, 0, c.step ?? 0]));
        } else {
          const id = this.varId(`Quest: ${c.id}`);
          out.push(cmd(122, ind, [id, id, 0, 0, c.op === "start" ? 1 : 2]));
        }
        return;
      }
      case "action":
        if (c.verb === "erase") {
          out.push(cmd(214, ind));
          return;
        }
        this.report.staged.push({ text: `${c.verb} ${c.args}`, line });
        comment(`ACTION (stage by hand): ${c.verb} ${c.args}`);
        return;
      case "describe":
        this.report.staged.push({ text: c.text, line });
        comment(`STAGE: ${c.text}`);
        return;
    }
  }

  private ifChain(branches: Array<{ cond: Cond | null; body: Node[] }>, ind: number, ctx: string, out: MvCommand[]) {
    const conds = branches.filter((b) => b.cond);
    const fallback = branches.find((b) => !b.cond);
    if (!conds.length) {
      if (fallback) this.body(fallback.body, ind, ctx, out);
      return;
    }
    const [first, ...rest] = conds;
    out.push(cmd(111, ind, this.condParams(first.cond!)));
    this.body(first.body, ind + 1, ctx, out);
    out.push(cmd(0, ind + 1));
    if (rest.length || fallback) {
      out.push(cmd(411, ind));
      this.ifChain([...rest, ...(fallback ? [fallback] : [])], ind + 1, ctx, out);
      out.push(cmd(0, ind + 1));
    }
    out.push(cmd(412, ind));
  }

  body(nodes: Node[], ind: number, ctx: string, out: MvCommand[]) {
    for (const n of nodes) {
      switch (n.n) {
        case "say":
          this.say(out, ind, n.speaker, n.as, n.mood, this.text(n.text));
          break;
        case "cmd":
          this.command(n.cmd, n.line, ind, out);
          break;
        case "menu": {
          if (n.prompt) this.say(out, ind, this.cfg.narrator, undefined, undefined, this.text(n.prompt));
          if (n.options.some((o) => o.cond)) this.report.notes.push(`Line ${n.line}: MV can't hide choices natively; conditional choices are always shown.`);
          out.push(cmd(102, ind, [n.options.map((o) => o.text), -1, 0, 2, 0]));
          n.options.forEach((o, k) => {
            out.push(cmd(402, ind, [k, o.text]));
            for (const e of o.effects) this.command(e, n.line, ind + 1, out);
            this.body(o.body, ind + 1, ctx, out);
            out.push(cmd(0, ind + 1));
          });
          out.push(cmd(404, ind));
          break;
        }
        case "if":
          this.ifChain(n.branches, ind, ctx, out);
          break;
        case "custom":
          this.custom(n, ind, ctx, out);
          break;
        case "note":
          out.push(cmd(108, ind, [n.text]));
          break;
        case "draft":
          this.report.notes.push(`Line ${n.line}: draft prose exported as plain narration until it's converted.`);
          for (const p of paragraphs(n.text)) this.say(out, ind, this.cfg.narrator, undefined, undefined, p);
          break;
        case "code":
          if (n.engine !== "mv") {
            this.report.notes.push(`Line ${n.line}: ::: ${n.engine} block skipped (MV export).`);
            out.push(cmd(108, ind, [`::: ${n.engine} block (other engine)`]));
          } else {
            // An ::: mv block is JavaScript, run as one Script command.
            const [first, ...rest] = n.text.split("\n");
            out.push(cmd(355, ind, [first]), ...rest.map((l) => cmd(655, ind, [l])));
          }
          break;
        case "original":
          break;
        case "todo":
          this.report.todos.push({ text: n.text, line: n.line });
          out.push(cmd(111, ind, [12, "$gameTemp.isPlaytest()"]));
          this.say(out, ind + 1, null, undefined, undefined, `\\C[2]TODO: ${n.text}\\C[0]`);
          out.push(cmd(0, ind + 1), cmd(412, ind));
          break;
      }
    }
  }

  private custom(n: Extract<Node, { n: "custom" }>, ind: number, ctx: string, out: MvCommand[]) {
    const spec = this.cfg.blocks[n.type] ?? {};
    if (spec.export === false) {
      if (n.type === "DRAFT") this.report.notes.push(`Draft at line ${n.line} not exported until approved: ${n.header}`);
      out.push(cmd(108, ind, [`${n.type}: ${n.header} (not exported)`]));
      return;
    }
    const items = n.items.map((it, k) => {
      const entry: Record<string, unknown> = { marker: it.marker, key: it.key, mods: it.mods, value: it.value };
      if (it.body.length) entry.commonEvent = this.addCommonEvent(`${ctx} · ${n.type} ${k + 1}`, it.body, ctx).id;
      return entry;
    });
    const data = JSON.stringify({ type: n.type, header: n.header, items });
    out.push(cmd(355, ind, [`$gameTemp._intentData = ${data};`]));
    out.push(cmd(356, ind, [`${spec.mvPluginCommand ?? "Intent"} ${n.type}`]));
  }

  addCommonEvent(name: string, nodes: Node[], ctx: string): MvCommonEvent {
    const ce: MvCommonEvent = { id: this.nextCe++, name, trigger: 0, switchId: 1, list: [] };
    this.commonEvents.push(ce);
    this.body(nodes, 0, ctx, ce.list);
    ce.list.push(cmd(0, 0));
    return ce;
  }

  private addChainEvent(name: string, branches: Array<{ cond: Cond | null; body: Node[] }>, ctx: string): MvCommonEvent {
    const ce: MvCommonEvent = { id: this.nextCe++, name, trigger: 0, switchId: 1, list: [] };
    this.commonEvents.push(ce);
    this.ifChain(branches, 0, ctx, ce.list);
    ce.list.push(cmd(0, 0));
    return ce;
  }

  script(s: Script) {
    for (const ch of s.chapters)
      for (const sc of ch.scenes) this.addCommonEvent(sc.title ? `${ch.title} · ${sc.title}` : ch.title, sc.body, sc.id);
    this.blocks(s.blocks);
  }

  private blocks(blocks: DataBlock[]) {
    const talks = new Map<string, DataBlock[]>();
    for (const b of blocks.filter((b) => b.kind === "talk")) talks.set(b.name, [...(talks.get(b.name) ?? []), b]);
    for (const [npc, list] of talks) {
      // Last written wins: test the newest first.
      const branches = [...list].reverse().map((b) => ({ cond: b.when ?? null, body: b.body ?? [] }));
      const withFallbackLast = [...branches.filter((b) => b.cond), ...branches.filter((b) => !b.cond).slice(0, 1)];
      this.addChainEvent(`Talk: ${npc}`, withFallbackLast, `talk_${slug(npc)}`);
    }
    for (const b of blocks.filter((b) => b.kind === "event")) {
      const br = [...(b.branches ?? [])].reverse();
      const ordered = [...br.filter((x) => x.cond), ...br.filter((x) => !x.cond).slice(0, 1)];
      const ce = this.addChainEvent(`Event: ${b.name}`, ordered, `event_${slug(b.name)}`);
      const at = typeof b.fields.at === "string" ? b.fields.at : "";
      const xy = at.match(/\((\d+)\s*,\s*(\d+)\)/);
      const trig = String(b.fields.trigger ?? "action").toLowerCase();
      const trigger = { action: 0, touch: 1, "event touch": 2, auto: 3, always: 4, parallel: 4 }[trig] ?? 0;
      this.mapEvents.push({
        name: b.name,
        note: `Artache Intent · ${at}`,
        x: xy ? Number(xy[1]) : 0,
        y: xy ? Number(xy[2]) : 0,
        pages: [
          {
            conditions: {
              actorId: 1, actorValid: false, itemId: 1, itemValid: false, selfSwitchCh: "A", selfSwitchValid: false,
              switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false, variableId: 1, variableValid: false, variableValue: 0,
            },
            directionFix: false,
            image: { characterIndex: 0, characterName: "", direction: 2, pattern: 0, tileId: 0 },
            list: [cmd(117, 0, [ce.id]), cmd(0, 0)],
            moveFrequency: 3, moveRoute: { list: [{ code: 0, parameters: [] }], repeat: true, skippable: false, wait: false },
            moveSpeed: 3, moveType: 0, priorityType: 1, stepAnime: false, through: false, trigger, walkAnime: true,
          },
        ],
      });
      if (!xy) this.report.notes.push(`Event "${b.name}": place it on ${at || "its map"} by hand (no tile given).`);
    }
  }

  output(): MvOutput {
    const flip = (m: Map<string, number>) => Object.fromEntries([...m].map(([n, id]) => [id, n]));
    return { commonEvents: this.commonEvents, mapEvents: this.mapEvents, switches: flip(this.switches), variables: flip(this.variables), report: this.report };
  }
}

export function exportMv(scripts: Script[], cfg: ProjectConfig): MvOutput {
  const ex = new MvExporter(cfg);
  for (const s of scripts) ex.script(s);
  return ex.output();
}
