// A read-through of the scene under the cursor: what the player will see,
// with stage directions as small chips. No engine needed.

import type { Command, Cond, Inline, Node } from "../src/core/ast.ts";
import { conditionText } from "../src/core/condition.ts";
import type { ProjectConfig } from "../src/core/config.ts";

function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        switch (p.t) {
          case "text":
            return <span key={i}>{p.v}</span>;
          case "italic":
            return <em key={i}><InlineText parts={p.v} /></em>;
          case "slow":
            return <span key={i} className="slow"><InlineText parts={p.v} /></span>;
          case "beat":
            return <span key={i} className="beat" title="beat">·</span>;
          case "stain":
            return <span key={i} className="stain" title={p.guess}>{p.word}</span>;
          case "link":
            return <span key={i} className="link">{p.label}</span>;
        }
      })}
    </>
  );
}

function chip(c: Command): string {
  switch (c.c) {
    case "bg":
      return `BG ${c.name}${c.tint ? ` (${c.tint})` : ""}`;
    case "cg":
      return `CG ${c.name}`;
    case "black":
      return "Black screen";
    case "music":
      return c.name ? `♪ ${c.name}` : "♪ stop";
    case "sound":
      return `🔊 ${c.name}`;
    case "pause":
      return `pause ${c.seconds}s`;
    case "shake":
      return "shake";
    case "fade":
      return `fade ${c.dir}`;
    case "sprite": {
      const bits = [c.expression, c.copying && `copying ${c.copying}`, c.position, ...c.mods].filter(Boolean);
      const mv = c.move.k === "enter" ? `enters from ${c.move.from}` : c.move.k === "exit" ? (c.move.fast ? "leaves fast" : `leaves ${c.move.to ?? ""}`) : c.move.k === "move" ? `to ${c.move.to}` : "";
      return `${c.who} ${[...bits, mv].filter(Boolean).join(", ")}`;
    }
    case "hide":
      return `hide ${c.who}`;
    case "lineup":
      return `lineup ${c.who.join(" ")}`;
    case "item":
      return `${c.delta > 0 ? "+" : ""}${c.delta} ${c.name}`;
    case "gold":
      return `${c.delta > 0 ? "+" : ""}${c.delta} gold`;
    case "var":
      return `${c.name} ${c.op === "set" ? "=" : "+="} ${c.value}`;
    case "switch":
      return `${c.name} ${c.on ? "on" : "off"}`;
    case "memory":
      return `${c.key}: ${c.value}`;
    case "quest":
      return `quest ${c.op} ${c.id}${c.step !== undefined ? ` ${c.step}` : ""}`;
    case "action":
      return `${c.verb} ${c.args}`;
    case "describe":
      return c.text;
  }
}

export function PreviewNodes({ nodes, cfg }: { nodes: Node[]; cfg: ProjectConfig }) {
  return (
    <>
      {nodes.map((n, i) => (
        <PreviewNode key={i} n={n} cfg={cfg} />
      ))}
    </>
  );
}

function Cond({ c }: { c: Cond | null }) {
  return <div className="cond">{c ? `if ${conditionText(c)}` : "otherwise"}</div>;
}

function PreviewNode({ n, cfg }: { n: Node; cfg: ProjectConfig }) {
  switch (n.n) {
    case "say": {
      const who = n.speaker ? cfg.cast[n.speaker] : undefined;
      const colorOf = n.as ?? n.speaker;
      const color = colorOf ? cfg.cast[colorOf]?.color : undefined;
      const isNarrator = (n.narration || n.speaker === cfg.narrator) && !n.as;
      const name = n.speaker ? (who?.display ?? n.speaker) : "";
      return (
        <div className={`say ${isNarrator || !n.speaker ? "narration" : ""}`} data-line={n.line}>
          {name && !isNarrator && (
            <div className="who" style={color ? { color } : undefined}>
              {name}
              {n.as && <span className="as"> as {cfg.cast[n.as]?.display ?? n.as}</span>}
              {n.mood && <span className="as"> ({n.mood})</span>}
            </div>
          )}
          <div className="line" style={n.as && color ? { borderLeftColor: color } : undefined}>
            <InlineText parts={n.text} />
          </div>
        </div>
      );
    }
    case "cmd":
      return <span className={`chip chip-${n.cmd.c}`}>{chip(n.cmd)}</span>;
    case "menu":
      return (
        <div className="menu">
          {n.prompt && <div className="prompt"><InlineText parts={n.prompt} /></div>}
          {n.options.map((o, k) => (
            <details key={k} className="option" open>
              <summary>
                {o.text}
                {o.cond && <span className="muted"> · if {conditionText(o.cond)}</span>}
              </summary>
              <div className="nested">
                {o.effects.map((e, j) => (
                  <span key={j} className="chip">{chip(e)}</span>
                ))}
                <PreviewNodes nodes={o.body} cfg={cfg} />
              </div>
            </details>
          ))}
        </div>
      );
    case "if":
      return (
        <div className="branch">
          {n.branches.map((b, k) => (
            <div key={k}>
              <Cond c={b.cond} />
              <div className="nested"><PreviewNodes nodes={b.body} cfg={cfg} /></div>
            </div>
          ))}
        </div>
      );
    case "custom":
      return (
        <div className={`custom ${cfg.blocks[n.type]?.export === false ? "draft" : ""}`}>
          <div className="custom-head">{n.type}{n.header ? `: ${n.header}` : ""}</div>
          {n.items.map((it, k) => (
            <div key={k} className="custom-item">
              <b>{it.marker === "*" ? "• " : it.marker === "-" ? "– " : ""}{it.key}</b>
              {it.mods.length > 0 && <span className="muted"> ({it.mods.join(", ")})</span>}
              {it.value && <span>: {it.value}</span>}
              {it.body.length > 0 && <div className="nested"><PreviewNodes nodes={it.body} cfg={cfg} /></div>}
            </div>
          ))}
        </div>
      );
    case "note":
      return <div className="note">{n.text}</div>;
    case "todo":
      return <div className="todo">TODO: {n.text}</div>;
    case "draft":
      return (
        <div className="draft-card" data-line={n.line}>
          <div className="tag">Draft · not converted yet</div>
          {n.text.split(/\n\s*\n/).map((p, k) => <p key={k}>{p}</p>)}
        </div>
      );
    case "code":
      return (
        <div className="code-card" data-line={n.line}>
          <div className="tag">{n.engine === "renpy" ? "Ren'Py code" : "RPG Maker MV script"}</div>
          <pre>{n.text}</pre>
        </div>
      );
    case "original":
      return null;
    case "narrator":
      return <span className="chip chip-narrator">Narrator: {n.who ? (cfg.cast[n.who]?.display ?? n.who) : "none"}</span>;
  }
}

// Book view: the same scene read as a manuscript, the way a writer drafts it.

function quoteLine(parts: Inline[]): Inline[] {
  return [{ t: "text", v: "“" }, ...parts, { t: "text", v: "”" }];
}

function BookNode({ n, cfg }: { n: Node; cfg: ProjectConfig }) {
  switch (n.n) {
    case "say": {
      if (!n.speaker || ((n.narration || n.speaker === cfg.narrator) && !n.as)) return <p data-line={n.line}><InlineText parts={n.text} /></p>;
      const name = cfg.cast[n.speaker]?.display ?? n.speaker;
      return (
        <p data-line={n.line}>
          <InlineText parts={quoteLine(n.text)} /> <span className="muted">{name}{n.mood ? `, ${n.mood}` : ""}.</span>
        </p>
      );
    }
    case "menu":
      return (
        <>
          {n.prompt && <p><InlineText parts={n.prompt} /></p>}
          <p className="book-choice">Choice: {n.options.map((o) => o.text).join(" / ")}</p>
          {n.options.slice(0, 1).map((o, k) => <BookNodes key={k} nodes={o.body} cfg={cfg} />)}
        </>
      );
    case "if":
      return <BookNodes nodes={n.branches[0]?.body ?? []} cfg={cfg} />;
    case "draft":
      return (
        <div className="book-draft" data-line={n.line}>
          {n.text.split(/\n\s*\n/).map((p, k) => <p key={k}>{p}</p>)}
        </div>
      );
    case "original":
      return (
        <details className="book-code">
          <summary>Original draft of the passage above</summary>
          {n.text.split(/\n\s*\n/).map((p, k) => <p key={k}>{p}</p>)}
        </details>
      );
    case "code":
      return <p className="book-code">[{n.engine === "renpy" ? "Ren'Py" : "MV"} code]</p>;
    case "custom":
      return <p className="book-code">[{n.type}{n.header ? `: ${n.header}` : ""}]</p>;
    default:
      return null;
  }
}

function BookNodes({ nodes, cfg }: { nodes: Node[]; cfg: ProjectConfig }) {
  return <>{nodes.map((n, i) => <BookNode key={i} n={n} cfg={cfg} />)}</>;
}

export function BookView({ title, nodes, cfg }: { title: string; nodes: Node[]; cfg: ProjectConfig }) {
  return (
    <article className="book">
      <h2 className="book-scene">{title}</h2>
      <BookNodes nodes={nodes} cfg={cfg} />
    </article>
  );
}
