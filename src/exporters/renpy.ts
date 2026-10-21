import type { Command, Cond, CustomItem, DataBlock, Inline, Node, Script } from "../core/ast.ts";
import type { ProjectConfig } from "../core/config.ts";
import { slug } from "../core/parser.ts";
import { addMissing, newReport, type Report } from "./report.ts";

export interface RenpyOutput {
  files: Record<string, string>;
  report: Report;
}

const IND = "    ";

function py(v: unknown): string {
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(py).join(", ")}]`;
  return `{${Object.entries(v as Record<string, unknown>).map(([k, x]) => `${JSON.stringify(k)}: ${py(x)}`).join(", ")}}`;
}

function rpyString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\[/g, "[[").replace(/\{/g, "{{");
}

export class RenpyExporter {
  report = newReport();
  private extraLabels: string[][] = [];
  private placeholders = new Map<string, string>();
  private voiceAs = new Map<string, { speaker: string; as: string }>();

  constructor(private cfg: ProjectConfig) {}

  private charId(key: string): string {
    return this.cfg.cast[key]?.id ?? slug(key);
  }

  private asset(kind: "bg" | "cg" | "music" | "sound", name: string, line: number): string {
    const mapped = this.cfg.assets[kind][name];
    if (mapped) return mapped;
    addMissing(this.report, kind, name, line);
    const fallback = slug(name);
    if (kind === "bg" || kind === "cg") this.placeholders.set(`${kind} ${fallback}`, `Placeholder("bg", text=${py(`${kind} ${name}`)})`);
    return fallback;
  }

  private imageTag(key: string): string {
    return this.cfg.cast[key]?.image ?? this.charId(key);
  }

  private expression(who: string, expr: string, line: number): string {
    const mapped = this.cfg.cast[who]?.expressions?.[expr];
    if (mapped) return mapped;
    const id = this.imageTag(who);
    addMissing(this.report, `sprite ${who}`, expr, line);
    this.placeholders.set(`${id} ${slug(expr)}`, `Placeholder("girl", text=${py(`${who} ${expr}`)})`);
    return slug(expr);
  }

  private audio(name: string): string {
    return /[./]/.test(name) ? py(name) : name;
  }

  text(parts: Inline[], speaker?: string | null): string {
    return parts
      .map((p) => {
        switch (p.t) {
          case "text":
            return rpyString(p.v);
          case "italic":
            return `{i}${this.text(p.v, speaker)}{/i}`;
          case "slow":
            return `{cps=8}${this.text(p.v, speaker)}{/cps}`;
          case "beat":
            return "{w=0.4}";
          case "stain": {
            const color = speaker ? this.cfg.cast[speaker]?.color : undefined;
            const word = rpyString(p.word);
            return `{a=intent_stain:${p.id}}${color ? `{color=${color}}${word}{/color}` : word}{/a}`;
          }
          case "link":
            return rpyString(p.label);
        }
      })
      .join("");
  }

  cond(c: Cond): string {
    switch (c.k) {
      case "flag":
        return `${py(c.name)} in intent_flags`;
      case "step":
        return `intent_vars.get("Story Step", 0) ${c.orMore ? ">=" : "=="} ${c.n}`;
      case "has":
        return `intent_items.get(${py(c.item)}, 0) > 0`;
      case "quest":
        return `intent_quests.get(${py(c.id)}) == ${py(c.state)}`;
      case "trust":
        return `intent_vars.get(${py(`Trust: ${c.who}`)}, 0) >= ${c.n}`;
      case "first":
        return "intent_first_time()";
      case "not":
        return `not (${this.cond(c.c)})`;
      case "and":
        return c.cs.map((x) => `(${this.cond(x)})`).join(" and ");
      case "or":
        return c.cs.map((x) => `(${this.cond(x)})`).join(" or ");
    }
  }

  private transforms(mods: string[], position?: string): string[] {
    const at: string[] = [];
    if (position) {
      const p = this.cfg.positions[position];
      at.push(`intent_pos(${p ? p.at : Number.parseFloat(position) / 100})`);
    }
    for (const m of mods) at.push(`intent_${slug(m)}`);
    return at;
  }

  private posValue(name: string): number {
    const p = this.cfg.positions[name];
    return p ? p.at : Number.parseFloat(name) / 100 || 0.5;
  }

  command(cmd: Command, line: number, ind: string): string[] {
    const tr = (t: string) =>
      t === "cut" ? [] : [`${ind}with ${t === "fade" ? "fade" : t === "slow" ? "Dissolve(1.5)" : "dissolve"}`];
    switch (cmd.c) {
      case "bg": {
        const key = cmd.tint ? `${cmd.name} ${cmd.tint}` : cmd.name;
        const name = this.cfg.assets.bg[key] ?? (cmd.tint ? `${this.asset("bg", cmd.name, line)}_${cmd.tint}` : this.asset("bg", cmd.name, line));
        return [`${ind}scene bg ${name}`, ...tr(cmd.transition)];
      }
      case "cg":
        return [`${ind}scene cg ${this.asset("cg", cmd.name, line)}`, ...tr(cmd.transition)];
      case "black":
        return [`${ind}scene black`, ...tr(cmd.transition)];
      case "music":
        return cmd.name
          ? [`${ind}play music ${this.audio(this.asset("music", cmd.name, line))} fadein 1.0 fadeout 1.0`]
          : [`${ind}stop music fadeout 1.5`];
      case "sound":
        return [`${ind}play sound ${this.audio(this.asset("sound", cmd.name, line))}`];
      case "pause":
        return [`${ind}pause ${cmd.seconds}`];
      case "shake":
        return [`${ind}with vpunch`];
      case "fade":
        return cmd.dir === "out" ? [`${ind}scene black with fade`] : [`${ind}with dissolve`];
      case "sprite": {
        const id = this.imageTag(cmd.who);
        const img = cmd.copying
          ? `${id} ${this.expression(cmd.who, `copying ${cmd.copying}`, line)}`
          : cmd.expression
            ? `${id} ${this.expression(cmd.who, cmd.expression, line)}`
            : id;
        const mv = cmd.move;
        if (mv.k === "exit") {
          const how = mv.fast ? "Dissolve(0.15)" : mv.to ? `moveout${this.posValue(mv.to) < 0.5 ? "left" : "right"}` : "dissolve";
          return [`${ind}hide ${id}`, `${ind}with ${how}`];
        }
        if (mv.k === "enter") {
          const target = cmd.position ? this.posValue(cmd.position) : this.posValue(mv.from);
          const side = this.posValue(mv.from) < 0.5 ? "left" : "right";
          const extra = this.transforms(cmd.mods);
          return [`${ind}show ${img} at ${[`intent_enter_${side}(${target})`, ...extra].join(", ")}`];
        }
        if (mv.k === "move") {
          return [`${ind}show ${img} at ${this.transforms(cmd.mods, mv.to).join(", ")}`, `${ind}with move`];
        }
        const at = this.transforms(cmd.mods, cmd.position);
        return [`${ind}show ${img}${at.length ? ` at ${at.join(", ")}` : ""}`];
      }
      case "hide":
        return [`${ind}hide ${this.imageTag(cmd.who)}`];
      case "lineup":
        return cmd.who.map((w, k) => `${ind}show ${this.imageTag(w)} at intent_pos(${((k + 1) / (cmd.who.length + 1)).toFixed(2)})`);
      case "item":
        return [`${ind}$ intent_give(${py(cmd.name)}, ${cmd.delta})`];
      case "gold":
        return [`${ind}$ intent_vars["Gold"] = intent_vars.get("Gold", 0) + ${cmd.delta}`];
      case "var":
        return cmd.op === "set"
          ? [`${ind}$ intent_vars[${py(cmd.name)}] = ${cmd.value}`]
          : [`${ind}$ intent_vars[${py(cmd.name)}] = intent_vars.get(${py(cmd.name)}, 0) + ${cmd.value}`];
      case "switch":
        return [`${ind}$ intent_flags.${cmd.on ? "add" : "discard"}(${py(cmd.name)})`];
      case "memory": {
        const tpl = this.cfg.renpy.memory[cmd.key];
        if (tpl) {
          const id = this.cfg.cast[cmd.value.split(/\s+/)[0].toUpperCase()]?.id ?? slug(cmd.value);
          return tpl.split("\n").map((l) => ind + l.replaceAll("{value}", cmd.value).replaceAll("{slug}", slug(cmd.value)).replaceAll("{id}", id));
        }
        return [`${ind}$ intent_remember(${py(cmd.key)}, ${py(cmd.value)})`];
      }
      case "quest":
        return [`${ind}$ intent_quest(${py(cmd.op)}, ${py(cmd.id)}${cmd.step !== undefined ? `, ${cmd.step}` : ""})`];
      case "action":
        this.report.staged.push({ text: `${cmd.verb} ${cmd.args}`, line });
        return [`${ind}# ACTION (stage by hand): ${cmd.verb} ${cmd.args}`];
      case "describe":
        this.report.staged.push({ text: cmd.text, line });
        return [`${ind}# STAGE: ${cmd.text}`];
    }
  }

  private sayer(speaker: string | null, as?: string): string | null {
    if (!speaker) return null;
    if (as) {
      const id = this.cfg.renpy.voiceAsId.replace("{speaker}", this.charId(speaker)).replace("{as}", this.charId(as));
      this.voiceAs.set(id, { speaker, as });
      return id;
    }
    return this.charId(speaker);
  }

  body(nodes: Node[], ind: string, ctx: string): string[] {
    const out: string[] = [];
    for (const n of nodes) out.push(...this.node(n, ind, ctx));
    return out;
  }

  private block(nodes: Node[], ind: string, ctx: string): string[] {
    const b = this.body(nodes, ind, ctx);
    return b.some((l) => !l.trim().startsWith("#")) ? b : [...b, `${ind}pass`];
  }

  node(n: Node, ind: string, ctx: string): string[] {
    switch (n.n) {
      case "say": {
        const who = this.sayer(n.speaker, n.as);
        const mood = n.mood && n.speaker ? ` ${this.expression(n.speaker, n.mood, n.line)}` : "";
        const color = n.as ?? n.speaker;
        const text = `"${this.text(n.text, color)}"`;
        const stains = n.text.filter((p) => p.t === "stain").map((p) => `${ind}$ intent_stains[${py(p.id)}] = ${py(p.guess)}`);
        return [...stains, `${ind}${who ? `${who}${n.as ? "" : mood} ` : ""}${text}`];
      }
      case "cmd":
        return this.command(n.cmd, n.line, ind);
      case "menu": {
        const out = [`${ind}menu:`];
        if (n.prompt) {
          const who = this.sayer(this.cfg.narrator);
          out.push(`${ind}${IND}${who ? `${who} ` : ""}"${this.text(n.prompt)}"`);
        }
        for (const o of n.options) {
          out.push(`${ind}${IND}"${rpyString(o.text)}"${o.cond ? ` if ${this.cond(o.cond)}` : ""}:`);
          const inner = [...o.effects.flatMap((e) => this.command(e, n.line, ind + IND + IND))];
          inner.push(...this.body(o.body, ind + IND + IND, ctx));
          out.push(...(inner.length ? inner : [`${ind}${IND}${IND}pass`]));
        }
        return out;
      }
      case "if": {
        const out: string[] = [];
        n.branches.forEach((b, k) => {
          const head = b.cond ? `${k === 0 ? "if" : "elif"} ${this.cond(b.cond)}:` : "else:";
          out.push(`${ind}${head}`, ...this.block(b.body, ind + IND, ctx));
        });
        return out;
      }
      case "custom":
        return this.custom(n, ind, ctx);
      case "note":
        return [`${ind}# ${n.text}`];
      case "todo":
        this.report.todos.push({ text: n.text, line: n.line });
        return [`${ind}if config.developer:`, `${ind}${IND}"{color=#f0f}TODO: ${rpyString(n.text)}{/color}"`];
    }
  }

  private custom(n: Extract<Node, { n: "custom" }>, ind: string, ctx: string): string[] {
    const spec = this.cfg.blocks[n.type] ?? {};
    if (spec.export === false) {
      if (n.type === "DRAFT") this.report.notes.push(`Draft at line ${n.line} not exported until approved: ${n.header}`);
      return [`${ind}# ${n.type}: ${n.header} (not exported)`];
    }
    const items = n.items.map((it: CustomItem, k: number) => {
      const entry: Record<string, unknown> = { marker: it.marker, key: it.key, mods: it.mods, value: it.value };
      if (it.body.length) {
        const label = `${ctx}_${slug(n.type)}_${n.line}_${k + 1}`;
        this.extraLabels.push([`label ${label}:`, ...this.body(it.body, IND, label), `${IND}return`]);
        entry.label = label;
      }
      return entry;
    });
    const label = spec.renpyLabel ?? `intent_${slug(n.type)}`;
    return [`${ind}$ _intent_data = ${py({ type: n.type, header: n.header, items })}`, `${ind}call ${label}`];
  }

  scriptFile(script: Script): string {
    const out: string[] = [`# Generated by Artache Intent from ${script.file}. Edit the script, not this file.`, ""];
    for (const ch of script.chapters) {
      for (const sc of ch.scenes) {
        const label = `${this.cfg.renpy.labelPrefix}${sc.id}`;
        out.push(`label ${label}:`);
        if (sc.title) out.push(`${IND}# ${sc.title}`);
        out.push(...this.block(sc.body, IND, label), "");
      }
      if (ch.scenes.length) out.push(`label ${this.cfg.renpy.labelPrefix}${ch.id}_end:`, `${IND}return`, "");
    }
    out.push(...this.blockLabels(script.blocks));
    for (const l of this.extraLabels) out.push(...l, "");
    this.extraLabels = [];
    return out.join("\n");
  }

  private blockLabels(blocks: DataBlock[]): string[] {
    const out: string[] = [];
    const talks = new Map<string, DataBlock[]>();
    for (const b of blocks.filter((b) => b.kind === "talk")) {
      const k = b.name;
      talks.set(k, [...(talks.get(k) ?? []), b]);
    }
    for (const [npc, list] of talks) {
      const label = `${this.cfg.renpy.labelPrefix}talk_${slug(npc)}`;
      out.push(`label ${label}:`);
      // The talk written last wins, so test it first.
      const ordered = [...list].reverse();
      const withCond = ordered.filter((b) => b.when);
      const fallback = ordered.find((b) => !b.when);
      withCond.forEach((b, k) => out.push(`${IND}${k ? "elif" : "if"} ${this.cond(b.when!)}:`, ...this.block(b.body ?? [], IND + IND, label)));
      if (fallback) {
        if (withCond.length) out.push(`${IND}else:`, ...this.block(fallback.body ?? [], IND + IND, label));
        else out.push(...this.block(fallback.body ?? [], IND, label));
      }
      out.push(`${IND}return`, "");
    }
    for (const b of blocks.filter((b) => b.kind === "event")) {
      const label = `${this.cfg.renpy.labelPrefix}event_${slug(b.name)}`;
      out.push(`label ${label}:`);
      const br = [...(b.branches ?? [])].reverse();
      const conds = br.filter((x) => x.cond);
      const plain = br.find((x) => !x.cond);
      conds.forEach((x, k) => out.push(`${IND}${k ? "elif" : "if"} ${this.cond(x.cond!)}:`, ...this.block(x.body, IND + IND, label)));
      if (plain) out.push(...(conds.length ? [`${IND}else:`, ...this.block(plain.body, IND + IND, label)] : this.block(plain.body, IND, label)));
      out.push(`${IND}return`, "");
    }
    return out;
  }

  definitions(): string {
    const out = ["# Generated by Artache Intent. Characters, positions and the small runtime the scripts use.", ""];
    for (const [key, m] of Object.entries(this.cfg.cast)) {
      const color = m.color ? `, color=${py(m.color)}` : "";
      out.push(`define ${m.id} = Character(${py(m.display ?? key)}${color}, image=${py(m.image ?? m.id)})`);
    }
    for (const [id, v] of this.voiceAs) {
      const s = this.cfg.cast[v.speaker];
      const a = this.cfg.cast[v.as];
      const color = a?.color ? `, color=${py(a.color)}` : "";
      out.push(`define ${id} = Character(${py(s?.display ?? v.speaker)}${color})`);
    }
    out.push(
      "",
      "default intent_flags = set()",
      "default intent_vars = {}",
      "default intent_items = {}",
      "default intent_quests = {}",
      "default intent_memory = {}",
      "default intent_stains = {}",
      "",
      "init python:",
      "    def intent_give(name, n):",
      "        intent_items[name] = max(0, intent_items.get(name, 0) + n)",
      "    def intent_remember(key, value):",
      "        intent_memory.setdefault(key, [])",
      "        if value not in intent_memory[key]:",
      "            intent_memory[key].append(value)",
      "    def intent_quest(op, qid, step=None):",
      "        intent_quests[qid] = {'start': 'active', 'step': 'active', 'done': 'done'}[op]",
      "    def intent_first_time():",
      "        return not renpy.seen_label(renpy.get_current_label() or '')",
      "    def intent_stain_clicked(stain_id):",
      "        renpy.call_in_new_context('intent_stain', stain_id)",
      "    config.hyperlink_handlers['intent_stain'] = intent_stain_clicked",
      "",
      "# A stain shows the narrator's guess. Replace this label to restyle it.",
      "label intent_stain(stain_id):",
      `    ${this.cfg.narrator ? `${this.charId(this.cfg.narrator)} ` : ""}"[intent_stains[stain_id]]"`,
      "    return",
      "",
      "transform intent_pos(x=0.5):",
      "    xcenter x",
      "    yalign 1.0",
      "transform intent_enter_left(x=0.5):",
      "    xcenter -0.2 yalign 1.0",
      "    easein 0.4 xcenter x",
      "transform intent_enter_right(x=0.5):",
      "    xcenter 1.2 yalign 1.0",
      "    easein 0.4 xcenter x",
      "transform intent_back:",
      "    zoom 0.85 matrixcolor BrightnessMatrix(-0.15)",
      "transform intent_close:",
      "    zoom 1.35 yoffset 300",
      "transform intent_edge:",
      "    xoffset 220",
      "transform intent_facing_right:",
      "    xzoom -1.0",
      "transform intent_facing_left:",
      "    xzoom 1.0",
      "transform intent_faded:",
      "    linear 0.3 alpha 0.35",
      "transform intent_solid:",
      "    linear 0.3 alpha 1.0",
      "",
    );
    if (this.placeholders.size) {
      out.push("# Placeholders for art that doesn't exist yet. Your own images win (they load later).");
      out.push("init -100:");
      for (const [name, disp] of this.placeholders) out.push(`    image ${name} = ${disp}`);
      out.push("");
    }
    return out.join("\n");
  }
}

export function exportRenpy(scripts: Script[], cfg: ProjectConfig): RenpyOutput {
  const ex = new RenpyExporter(cfg);
  const files: Record<string, string> = {};
  for (const s of scripts) files[`${slug(s.file.replace(/\.[^.]+$/, ""))}.rpy`] = ex.scriptFile(s);
  files["intent_defs.rpy"] = ex.definitions();
  return { files, report: ex.report };
}
