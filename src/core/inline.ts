import type { Inline } from "./ast.ts";

export interface InlineOptions {
  doubleBrackets: "stain" | "link";
  /** Called for each stain so ids stay unique across a file. */
  nextStainId: () => string;
}

/** Parse `*italic*`, `~slow~`, `|` beats and `[[ ... ]]` inside one line. */
export function parseInline(src: string, opts: InlineOptions): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "[" && src[i + 1] === "[") {
      const end = src.indexOf("]]", i + 2);
      if (end !== -1) {
        flush();
        const inner = src.slice(i + 2, end);
        const bar = inner.indexOf("|");
        const a = (bar === -1 ? inner : inner.slice(0, bar)).trim();
        const b = bar === -1 ? "" : inner.slice(bar + 1).trim();
        if (opts.doubleBrackets === "stain") out.push({ t: "stain", word: a, guess: b, id: opts.nextStainId() });
        else out.push({ t: "link", target: a, label: b || a });
        i = end + 2;
        continue;
      }
    }
    if (ch === "*" || ch === "~") {
      const end = src.indexOf(ch, i + 1);
      if (end > i + 1) {
        flush();
        const inner = parseInline(src.slice(i + 1, end), opts);
        out.push(ch === "*" ? { t: "italic", v: inner } : { t: "slow", v: inner });
        i = end + 1;
        continue;
      }
    }
    if (ch === "|") {
      // "a | b" reads "a {beat}b": keep the space before the bar, drop the one after.
      flush();
      out.push({ t: "beat" });
      i++;
      if (src[i] === " ") i++;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

export function plainText(parts: Inline[]): string {
  return parts
    .map((p) => {
      switch (p.t) {
        case "text":
          return p.v;
        case "italic":
        case "slow":
          return plainText(p.v);
        case "beat":
          return "";
        case "stain":
          return p.word;
        case "link":
          return p.label;
      }
    })
    .join("");
}
