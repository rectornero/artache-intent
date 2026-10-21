import type { Cond } from "./ast.ts";

/**
 * Conditions read like English: `step 2000+, has Chopping Axe`, `rain or night`,
 * `not has Chopping Axe`, `followed_free`. A comma or "and" means and.
 */
export function parseCondition(src: string): Cond {
  const ors = src.split(/\s+or\s+/i).map((s) => s.trim()).filter(Boolean);
  if (ors.length > 1) return { k: "or", cs: ors.map(parseCondition) };
  const ands = src.split(/\s*,\s*|\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
  if (ands.length > 1) return { k: "and", cs: ands.map(parseCondition) };
  return parseAtom(src.trim());
}

function parseAtom(s: string): Cond {
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^not\s+(.+)$/i))) return { k: "not", c: parseAtom(m[1]) };
  if ((m = s.match(/^step\s+(\d+)\s*(\+)?$/i))) return { k: "step", n: Number(m[1]), orMore: !!m[2] };
  if ((m = s.match(/^has\s+(.+)$/i))) return { k: "has", item: m[1].trim() };
  if ((m = s.match(/^quest\s+(\S+)\s+(active|done|failed|not started)$/i)))
    return { k: "quest", id: m[1], state: m[2].toLowerCase() };
  if ((m = s.match(/^trust\s+(.+?)\s+(\d+)\s*\+?$/i))) return { k: "trust", who: m[1], n: Number(m[2]) };
  if (/^first\s+time$/i.test(s)) return { k: "first" };
  if ((m = s.match(/^switch\s+(.+)$/i))) return { k: "flag", name: m[1].trim() };
  if ((m = s.match(/^time\s+(.+)$/i))) return { k: "flag", name: `time ${m[1].trim()}` };
  return { k: "flag", name: s };
}

export function conditionText(c: Cond): string {
  switch (c.k) {
    case "flag":
      return c.name;
    case "step":
      return `step ${c.n}${c.orMore ? "+" : ""}`;
    case "has":
      return `has ${c.item}`;
    case "quest":
      return `quest ${c.id} ${c.state}`;
    case "trust":
      return `trust ${c.who} ${c.n}+`;
    case "first":
      return "first time";
    case "not":
      return `not ${conditionText(c.c)}`;
    case "and":
      return c.cs.map(conditionText).join(", ");
    case "or":
      return c.cs.map(conditionText).join(" or ");
  }
}
