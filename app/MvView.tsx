// The RPG Maker MV export, read as a list of event commands.

const MV_NAMES: Record<number, string> = {
  101: "Text", 401: "", 102: "Choices", 402: "When", 404: "End", 111: "If", 411: "Else", 412: "End",
  117: "Common event", 121: "Switch", 122: "Variable", 125: "Gold", 126: "Item", 108: "Comment",
  214: "Erase event", 221: "Fade out", 222: "Fade in", 225: "Shake", 230: "Wait", 231: "Picture",
  232: "Move picture", 235: "Erase picture", 241: "BGM", 242: "Fade BGM", 250: "SE", 355: "Script", 356: "Plugin",
};

export function MvView({ json }: { json: string }) {
  const events: Array<{ id: number; name: string; list: Array<{ code: number; indent: number; parameters: unknown[] }> }> = JSON.parse(json);
  return (
    <div className="mv">
      {events.map((e) => (
        <details key={e.id} open={events.length < 4}>
          <summary>#{e.id} {e.name}</summary>
          <div className="mv-list">
            {e.list.filter((c) => c.code !== 0).map((c, k) => (
              <div key={k} className="mv-cmd" style={{ paddingLeft: 8 + c.indent * 16 }}>
                {c.code === 401 ? <span className="mv-text">{String(c.parameters[0])}</span> : (
                  <>
                    <span className="mv-code">◆{MV_NAMES[c.code] ?? c.code}</span>{" "}
                    <span className="muted">{c.code === 402 ? String(c.parameters[1]) : c.code === 101 ? String(c.parameters[0] || "") : JSON.stringify(c.parameters).slice(1, -1).slice(0, 90)}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
