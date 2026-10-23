import { useState } from "react";
import { CLAUDE_MODELS, type ClaudeModel, type ClaudeVia } from "./claude.ts";
import { THEMES, type Theme, type UiPrefs } from "./themes.ts";
import { forgetRenpySdk, isPhone, isTauri } from "./storage.ts";

const SPELL_LANGS = [["en-GB", "English (UK)"], ["en-US", "English (US)"], ["it", "Italian"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["pt", "Portuguese"]];

export function Settings({ prefs, setPrefs, theme, apiKey, setApiKey, model, setModel, via, setVia, onClose }: { prefs: UiPrefs; setPrefs: (p: UiPrefs) => void; theme: Theme; apiKey: string; setApiKey: (k: string) => void; model: ClaudeModel; setModel: (m: ClaudeModel) => void; via: ClaudeVia; setVia: (v: ClaudeVia) => void; onClose: () => void }) {
  const [keyDraft, setKeyDraft] = useState("");
  const [sdkForgotten, setSdkForgotten] = useState(false);
  const custom: Theme = prefs.custom ?? { ...structuredClone(theme), id: "custom", label: "Custom" };
  const setCustom = (t: Theme) => setPrefs({ ...prefs, custom: t, themeId: "custom" });
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <h3>Theme</h3>
        <div className="theme-grid">
          {[...THEMES, ...(prefs.custom ? [prefs.custom] : [])].map((t) => (
            <button key={t.id} className={`theme-card ${prefs.themeId === t.id ? "active" : ""}`} onClick={() => setPrefs({ ...prefs, themeId: t.id })}
              style={{ background: t.colors.bg, color: t.colors.text, borderColor: prefs.themeId === t.id ? t.colors.accent : t.colors.border }}>
              <img src={t.brand.logo} alt="" />
              <span className="swatches">
                {[t.colors.accent, t.colors.speaker, t.colors.stage, t.colors.block].map((c, i) => <i key={i} style={{ background: c }} />)}
              </span>
              {t.label}
            </button>
          ))}
        </div>
        <details className="custom-theme">
          <summary>Customise colours and brand</summary>
          <div className="form-grid">
            <label>Brand name<input value={custom.brand.name} onChange={(e) => setCustom({ ...custom, brand: { ...custom.brand, name: e.target.value } })} /></label>
            <label>Product name<input value={custom.brand.product} onChange={(e) => setCustom({ ...custom, brand: { ...custom.brand, product: e.target.value } })} /></label>
            <label>Tagline<input value={custom.brand.tagline} onChange={(e) => setCustom({ ...custom, brand: { ...custom.brand, tagline: e.target.value } })} /></label>
            <label>Logo<input type="file" accept="image/*" onChange={(e) => readImage(e.target.files?.[0], (logo) => setCustom({ ...custom, brand: { ...custom.brand, logo } }))} /></label>
            <label>Icon<input type="file" accept="image/*" onChange={(e) => readImage(e.target.files?.[0], (icon) => setCustom({ ...custom, brand: { ...custom.brand, icon } }))} /></label>
            <label>Dark<input type="checkbox" checked={custom.dark} onChange={(e) => setCustom({ ...custom, dark: e.target.checked })} /></label>
            {(Object.keys(custom.colors) as Array<keyof Theme["colors"]>).map((k) => (
              <label key={k}>{k}<input type="color" value={custom.colors[k]} onChange={(e) => setCustom({ ...custom, colors: { ...custom.colors, [k]: e.target.value } })} /></label>
            ))}
          </div>
        </details>
        <h3>Layout</h3>
        <div className="form-grid">
          <label>Output panel
            <select value={prefs.sidePanel} onChange={(e) => setPrefs({ ...prefs, sidePanel: e.target.value as UiPrefs["sidePanel"] })}>
              <option value="right">Right</option>
              <option value="bottom">Bottom</option>
              <option value="hidden">Hidden</option>
            </select>
          </label>
          <label>Editor text size
            <input type="range" min={12} max={22} value={prefs.editorSize} onChange={(e) => setPrefs({ ...prefs, editorSize: Number(e.target.value) })} />
          </label>
          <label>Show outline<input type="checkbox" checked={prefs.showOutline} onChange={(e) => setPrefs({ ...prefs, showOutline: e.target.checked })} /></label>
          <label title="In the Draft, text Claude wrote shows in Claude's colour until you edit it">Show who wrote what<input type="checkbox" checked={prefs.showAuthors !== false} onChange={(e) => setPrefs({ ...prefs, showAuthors: e.target.checked })} /></label>
          <label title="Buttons above Draft and Play that insert characters, places, items, clues, minigames and interactions">Writer's toolbar<input type="checkbox" checked={prefs.showWriterBar !== false} onChange={(e) => setPrefs({ ...prefs, showWriterBar: e.target.checked })} /></label>
          <label title="Words in this version, the project and today, with your goals">Word count<input type="checkbox" checked={prefs.showWordCount !== false} onChange={(e) => setPrefs({ ...prefs, showWordCount: e.target.checked })} /></label>
          <label title="Underlines misspelt words in the Draft and Play, using this device's dictionaries">Spellcheck
            <select value={prefs.spellcheck === false ? "off" : prefs.spellcheck ?? ""} onChange={(e) => setPrefs({ ...prefs, spellcheck: e.target.value === "off" ? false : e.target.value })}>
              <option value="off">Off</option>
              <option value="">Device language</option>
              {SPELL_LANGS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </label>
          <label>Wrap long lines<input type="checkbox" checked={prefs.wrap} onChange={(e) => setPrefs({ ...prefs, wrap: e.target.checked })} /></label>
        </div>
        {isTauri() && !isPhone() && (
          <>
            <h3>Playtest</h3>
            <div className="row">
              <span className="muted">▶ Playtest writes the Ren'Py export into your game's game/ folder and starts the Ren'Py SDK on it. It asks for the SDK's renpy.exe the first time.</span>
              <button onClick={() => { forgetRenpySdk(); setSdkForgotten(true); }} disabled={sdkForgotten}>{sdkForgotten ? "It will ask next time" : "Choose renpy.exe again"}</button>
            </div>
          </>
        )}
        <h3>Claude</h3>
        <div className="claude-key">
          <p className="muted">Claude keeps Draft, Play and Code in step (✦ Update), checks your story, and drafts image and song prompts. Choose how Intent asks it:</p>
          <div className="model-pick" role="radiogroup" aria-label="How Intent asks Claude">
            <button role="radio" aria-checked={via === "paste" || !apiKey} className={via === "paste" || !apiKey ? "on" : ""} onClick={() => setVia("paste")}>
              <b>Copy and paste</b>
              <span>No key needed. Intent copies each request; you paste it into the Claude app, claude.ai or Claude Code, then paste the answer back.</span>
            </button>
            <button role="radio" aria-checked={via === "api" && !!apiKey} className={via === "api" && apiKey ? "on" : ""} onClick={() => setVia("api")}>
              <b>My API key</b>
              <span>One click, done in the app. Billed to your Anthropic account.</span>
            </button>
          </div>
          <p className="muted">
            The key stays on this device: it is never saved in your project or its exports. Get one at console.anthropic.com → API keys.
          </p>
          {apiKey ? (
            <div className="row">
              <span className="chip">Key added · ends in {apiKey.slice(-4)}</span>
              <button onClick={() => setApiKey("")}>Remove key</button>
            </div>
          ) : (
            <div className="row">
              <input type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-…" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} aria-label="Anthropic API key" />
              <button className="primary" disabled={!keyDraft.trim()} onClick={() => { setApiKey(keyDraft); setKeyDraft(""); }}>Save key</button>
            </div>
          )}
          <div className="model-pick" role="radiogroup" aria-label="Claude model">
            {CLAUDE_MODELS.map((m) => (
              <button key={m.id} role="radio" aria-checked={model === m.id} className={model === m.id ? "on" : ""} onClick={() => setModel(m.id)}>
                <b>{m.label}</b>
                <span>{m.note}</span>
              </button>
            ))}
          </div>
        </div>
        <footer className="about">
          <img src={theme.brand.logo} alt={theme.brand.name} />
          <span>{theme.brand.product} {__APP_VERSION__} · {theme.brand.tagline}</span>
        </footer>
      </div>
    </div>
  );
}

function readImage(file: File | undefined, done: (dataUrl: string) => void) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => typeof r.result === "string" && done(r.result);
  r.readAsDataURL(file);
}
