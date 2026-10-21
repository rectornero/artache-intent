// One place for every way Intent works with Claude: the API key, copy and
// paste, Claude Code on the project folder, and the MCP connector.

import { useEffect, useState } from "react";
import { isTauri } from "./storage.ts";

interface Props {
  folder?: string;
  hasKey: boolean;
  onSettings: () => void;
  onKeepInFolder: () => void;
  onSetUpClaudeCode: () => void;
  onClose: () => void;
}

const isWindows = () => /Windows/i.test(navigator.userAgent);

export function ConnectClaude({ folder, hasKey, onSettings, onKeepInFolder, onSetUpClaudeCode, onClose }: Props) {
  const [server, setServer] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  useEffect(() => {
    if (!isTauri() || !isWindows()) return;
    import("@tauri-apps/api/path").then(({ resolveResource }) => resolveResource("intent-mcp.exe")).then(setServer, () => setServer(null));
  }, []);
  // The Windows app carries intent-mcp.exe, which needs nothing else; elsewhere it's the .mjs on Node.
  const mcp = server ?? "C:\\path\\to\\intent-mcp.mjs";
  const cmd = server ? [server] : ["node", mcp];
  const dir = folder ?? "C:\\path\\to\\your\\project";
  const q = (s: string) => `"${s}"`;
  const claudeCode = `claude mcp add intent -- ${server ? q(server) : `node ${q(mcp)}`} ${q(dir)}`;
  const desktop = JSON.stringify({ mcpServers: { intent: { command: cmd[0], args: [...cmd.slice(1), dir] } } }, null, 2);
  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      // Clipboard blocked: the text is on screen to select by hand.
    }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal connect" role="dialog" aria-label="Connect Claude" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>✦ Connect Claude</h2>
          <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="muted">Claude keeps your versions in step, checks your story and drafts prompts. Pick whichever way suits you; they can be mixed.</p>

        <section className="connect-way">
          <h3>Inside Intent</h3>
          <p><b>{hasKey ? "Your API key is set." : "Copy and paste, no key needed."}</b> Every ✦ button either runs on your API key or copies the request for the Claude app and takes the answer back. Choose in Settings.</p>
          <button onClick={onSettings}>Open Settings</button>
        </section>

        <section className="connect-way">
          <h3>Claude Code on the project folder</h3>
          {folder ? (
            <>
              <p>Writes a <code>CLAUDE.md</code> into <code>{folder}</code> so Claude Code knows Intent's format and rules. Open the folder in Claude Code and ask; Intent picks up its edits when you come back to the window.</p>
              <button onClick={onSetUpClaudeCode}>Set up Claude Code</button>
            </>
          ) : isTauri() ? (
            <>
              <p>Claude Code works on files, so the project needs to live in a folder first. It then saves there as you type.</p>
              <button onClick={onKeepInFolder}>Keep this project in a folder…</button>
            </>
          ) : (
            <p className="muted">Needs the Windows or Android app: the browser can't share a folder with Claude Code.</p>
          )}
        </section>

        <section className="connect-way">
          <h3>Connector (MCP)</h3>
          <p>Gives Claude Code or the Claude desktop app Intent's own tools: read and write scripts with Intent's checks after every write, search, rename, see which versions are in step, and save story checks. Needs a folder project{server ? "; nothing else to install" : " and Node.js 20 or newer"}.</p>
          {!folder && <p className="muted">Paths below are placeholders until this project lives in a folder.</p>}
          {!server && <p className="muted">The Windows app includes the connector, ready to run. Elsewhere, download intent-mcp.mjs from the release page and put its path below.</p>}
          <div className="connect-snippet">
            <div className="snippet-head"><b>Claude Code</b><span className="muted">run in a terminal</span><button className="ghost" onClick={() => void copy("cc", claudeCode)}>{copied === "cc" ? "Copied ✓" : "Copy"}</button></div>
            <pre>{claudeCode}</pre>
          </div>
          <div className="connect-snippet">
            <div className="snippet-head"><b>Claude desktop app</b><span className="muted">Settings → Developer → Edit config</span><button className="ghost" onClick={() => void copy("cd", desktop)}>{copied === "cd" ? "Copied ✓" : "Copy"}</button></div>
            <pre>{desktop}</pre>
          </div>
        </section>
      </div>
    </div>
  );
}
