// A theme is the whole look, brand included: colours, fonts and the name in the
// top bar. Renaming the product means editing one theme, not the code.

export interface Theme {
  id: string;
  label: string;
  brand: { name: string; product: string; mark: string };
  dark: boolean;
  colors: {
    bg: string;
    panel: string;
    panel2: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
    accentText: string;
    error: string;
    warning: string;
    // syntax
    speaker: string;
    stage: string;
    flow: string;
    note: string;
    block: string;
  };
  fonts: { ui: string; editor: string; preview: string };
}

export const THEMES: Theme[] = [
  {
    id: "artache",
    label: "Artache",
    brand: { name: "Artache", product: "Intent", mark: "A" },
    dark: false,
    colors: {
      bg: "#f5f3ef",
      panel: "#ffffff",
      panel2: "#efece6",
      border: "#ddd8cf",
      text: "#1d1b18",
      muted: "#6d675e",
      accent: "#c2410c",
      accentText: "#ffffff",
      error: "#b91c1c",
      warning: "#a16207",
      speaker: "#1d4ed8",
      stage: "#7c3aed",
      flow: "#c2410c",
      note: "#8a8378",
      block: "#047857",
    },
    fonts: {
      ui: "'Inter', system-ui, sans-serif",
      editor: "'JetBrains Mono', ui-monospace, monospace",
      preview: "'Literata', Georgia, serif",
    },
  },
  {
    id: "night",
    label: "Night",
    brand: { name: "Artache", product: "Intent", mark: "A" },
    dark: true,
    colors: {
      bg: "#121214",
      panel: "#1a1a1d",
      panel2: "#222226",
      border: "#2e2e33",
      text: "#ecebe8",
      muted: "#9a978f",
      accent: "#fb923c",
      accentText: "#1a1a1d",
      error: "#f87171",
      warning: "#fbbf24",
      speaker: "#93c5fd",
      stage: "#c4b5fd",
      flow: "#fdba74",
      note: "#6f6c66",
      block: "#6ee7b7",
    },
    fonts: {
      ui: "'Inter', system-ui, sans-serif",
      editor: "'JetBrains Mono', ui-monospace, monospace",
      preview: "'Literata', Georgia, serif",
    },
  },
  {
    id: "parchment",
    label: "Parchment",
    brand: { name: "Artache", product: "Intent", mark: "A" },
    dark: false,
    colors: {
      bg: "#efe4cc",
      panel: "#f7efdc",
      panel2: "#e8dcc0",
      border: "#cdbb95",
      text: "#2b2118",
      muted: "#6b5b47",
      accent: "#8c2f1b",
      accentText: "#f7efdc",
      error: "#a11d1d",
      warning: "#8a5a00",
      speaker: "#8c2f1b",
      stage: "#5b4a8a",
      flow: "#a35a00",
      note: "#9a8a70",
      block: "#2f6b3a",
    },
    fonts: {
      ui: "'EB Garamond', Georgia, serif",
      editor: "'JetBrains Mono', ui-monospace, monospace",
      preview: "'IM Fell English', Georgia, serif",
    },
  },
  {
    id: "contrast",
    label: "High contrast",
    brand: { name: "Artache", product: "Intent", mark: "A" },
    dark: true,
    colors: {
      bg: "#000000",
      panel: "#0b0b0b",
      panel2: "#161616",
      border: "#5a5a5a",
      text: "#ffffff",
      muted: "#d0d0d0",
      accent: "#ffd400",
      accentText: "#000000",
      error: "#ff6b6b",
      warning: "#ffd400",
      speaker: "#7cd4ff",
      stage: "#e0b0ff",
      flow: "#ffd400",
      note: "#b0b0b0",
      block: "#7dff9b",
    },
    fonts: {
      ui: "system-ui, sans-serif",
      editor: "ui-monospace, monospace",
      preview: "system-ui, sans-serif",
    },
  },
];

export interface UiPrefs {
  themeId: string;
  custom: Theme | null;
  editorSize: number;
  sidePanel: "right" | "bottom" | "hidden";
  showOutline: boolean;
  wrap: boolean;
}

export const DEFAULT_PREFS: UiPrefs = {
  themeId: "artache",
  custom: null,
  editorSize: 15,
  sidePanel: "right",
  showOutline: true,
  wrap: true,
};

export function activeTheme(p: UiPrefs): Theme {
  if (p.themeId === "custom" && p.custom) return p.custom;
  return THEMES.find((t) => t.id === p.themeId) ?? THEMES[0];
}

export function applyTheme(t: Theme, p: UiPrefs) {
  const r = document.documentElement.style;
  for (const [k, v] of Object.entries(t.colors)) r.setProperty(`--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, v);
  r.setProperty("--font-ui", t.fonts.ui);
  r.setProperty("--font-editor", t.fonts.editor);
  r.setProperty("--font-preview", t.fonts.preview);
  r.setProperty("--editor-size", `${p.editorSize}px`);
  document.documentElement.dataset.dark = String(t.dark);
  document.title = `${t.brand.name} ${t.brand.product}`;
}
