// Line diff for comparing a saved version with the current text.

export type DiffLine = { op: "same" | "add" | "del"; text: string };

/** Longest-common-subsequence diff by line; the common head and tail are trimmed first. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const x = a.slice(head, a.length - tail);
  const y = b.slice(head, b.length - tail);
  const lcs: number[][] = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--) lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const mid: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      mid.push({ op: "same", text: x[i] });
      i++;
      j++;
    } else if (j < y.length && (i >= x.length || lcs[i][j + 1] >= lcs[i + 1][j])) mid.push({ op: "add", text: y[j++] });
    else mid.push({ op: "del", text: x[i++] });
  }
  return [...a.slice(0, head).map((text) => ({ op: "same" as const, text })), ...mid, ...a.slice(a.length - tail).map((text) => ({ op: "same" as const, text }))];
}

/** How many lines a diff adds and removes. */
export function diffStats(d: DiffLine[]): { added: number; removed: number } {
  return { added: d.filter((l) => l.op === "add").length, removed: d.filter((l) => l.op === "del").length };
}
