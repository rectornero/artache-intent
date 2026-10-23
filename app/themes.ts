// A theme is the whole look, brand included: logo, colours, fonts and names.
// Renaming or rebranding the product means editing one theme, not the code.

export interface Brand {
  name: string;
  product: string;
  tagline: string;
  /** Wordmark shown in the top bar (a path under app/public or a data: URL). */
  logo: string;
  /** Square mark for small spaces: phone top bar, favicon. */
  icon: string;
}

export interface Theme {
  id: string;
  label: string;
  brand: Brand;
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
  fonts: { ui: string; display: string; editor: string; preview: string };
}

const ARTACHE: Brand = {
  name: "Artache",
  product: "Intent",
  tagline: "With AI. By People.",
  logo: "brand/artache-logo.png",
  icon: "brand/intent-icon.svg",
};
const ARTACHE_DARK: Brand = { ...ARTACHE, logo: "brand/artache-logo-dark.png" };

const FONTS = {
  ui: "'Inter Variable', 'Inter', system-ui, sans-serif",
  display: "'Fraunces Variable', 'Fraunces', Georgia, serif",
  editor: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace",
  preview: "'Fraunces Variable', 'Fraunces', Georgia, serif",
};

export const THEMES: Theme[] = [
  {
    id: "artache",
    label: "Artache",
    brand: ARTACHE,
    dark: false,
    // The Artache palette: navy ink, signal red, warm paper.
    colors: {
      bg: "#faf8f3",
      panel: "#ffffff",
      panel2: "#f3f0e8",
      border: "#e6e1d6",
      text: "#13224b",
      muted: "#7a8099",
      accent: "#d7182a",
      accentText: "#ffffff",
      error: "#d7182a",
      warning: "#a05a00",
      speaker: "#13224b",
      stage: "#5a4fb0",
      flow: "#d7182a",
      note: "#8a8fa5",
      block: "#1f6f5c",
    },
    fonts: FONTS,
  },
  {
    id: "artache-night",
    label: "Artache Night",
    brand: ARTACHE_DARK,
    dark: true,
    colors: {
      bg: "#0a1128",
      panel: "#111a36",
      panel2: "#18234a",
      border: "#243058",
      text: "#f5f1e8",
      muted: "#8a92b2",
      accent: "#ff4d5a",
      accentText: "#0a1128",
      error: "#ff4d5a",
      warning: "#f5b84a",
      speaker: "#a9c1ff",
      stage: "#c4b5fd",
      flow: "#ff8a93",
      note: "#6d7598",
      block: "#7fd8bd",
    },
    fonts: FONTS,
  },
  {
    id: "parchment",
    label: "Parchment",
    brand: ARTACHE,
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
    fonts: { ...FONTS, preview: "'IM Fell English', Georgia, serif" },
  },
  {
    id: "contrast",
    label: "High contrast",
    brand: ARTACHE_DARK,
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
    fonts: { ...FONTS, preview: FONTS.ui },
  },
];

export interface UiPrefs {
  themeId: string;
  custom: Theme | null;
  editorSize: number;
  sidePanel: "right" | "bottom" | "hidden";
  showOutline: boolean;
  wrap: boolean;
  /** Draft: Claude's writing in its own colour. */
  showAuthors: boolean;
  /** The writer's toolbar above Draft and Play. */
  showWriterBar: boolean;
  /** Word count and goals under the text. */
  showWordCount: boolean;
}

export const DEFAULT_PREFS: UiPrefs = {
  themeId: "artache",
  custom: null,
  editorSize: 15,
  sidePanel: "right",
  showOutline: true,
  wrap: true,
  showAuthors: true,
  showWriterBar: true,
  showWordCount: true,
};

export function activeTheme(p: UiPrefs): Theme {
  if (p.themeId === "custom" && p.custom) return { ...p.custom, brand: { ...ARTACHE, ...p.custom.brand } };
  return THEMES.find((t) => t.id === p.themeId) ?? THEMES[0];
}

export function applyTheme(t: Theme, p: UiPrefs) {
  const r = document.documentElement.style;
  for (const [k, v] of Object.entries(t.colors)) r.setProperty(`--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, v);
  r.setProperty("--font-ui", t.fonts.ui);
  r.setProperty("--font-display", t.fonts.display);
  r.setProperty("--font-editor", t.fonts.editor);
  r.setProperty("--font-preview", t.fonts.preview);
  r.setProperty("--editor-size", `${p.editorSize}px`);
  document.documentElement.dataset.dark = String(t.dark);
  document.documentElement.style.colorScheme = t.dark ? "dark" : "light";
  document.title = `${t.brand.name} ${t.brand.product}`;
  let icon = document.querySelector<HTMLLinkElement>("link[rel=icon]");
  if (!icon) {
    icon = document.createElement("link");
    icon.rel = "icon";
    document.head.appendChild(icon);
  }
  icon.href = t.brand.icon;
}
