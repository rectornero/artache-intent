// Renders the Android launcher icons from src-tauri/icons/intent-icon.svg.
// Android 8+ shows an adaptive icon: a navy background plus the glyph, kept inside
// the middle two thirds so launchers can crop it to any shape. Run: node scripts/android-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const svg = readFileSync("src-tauri/icons/intent-icon.svg", "utf8");
const bg = svg.match(/<rect width="1024" height="1024" rx="224" fill="(#[0-9a-f]+)"\/>/)[1];
const glyph = svg.replace(/^[\s\S]*?<rect width="1024"[^>]*\/>/, "").replace(/<\/svg>\s*$/, "");
const scaled = (s) => `<g transform="translate(512 512) scale(${s}) translate(-512 -512)">${glyph}</g>`;
const doc = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${body}</svg>`;
const variants = {
  ic_launcher: svg,
  ic_launcher_round: doc(`<circle cx="512" cy="512" r="512" fill="${bg}"/>${scaled(0.86)}`),
  ic_launcher_foreground: doc(scaled(0.68)),
};
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage();
for (const [name, source] of Object.entries(variants)) {
  for (const [density, base] of Object.entries(sizes)) {
    const px = name === "ic_launcher_foreground" ? (base * 108) / 48 : base;
    await page.setViewportSize({ width: px, height: px });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${px}px;height:${px}px}</style>${source}`);
    writeFileSync(`src-tauri/icons/android/mipmap-${density}/${name}.png`, await page.screenshot({ omitBackground: true }));
  }
}
await browser.close();
writeFileSync("src-tauri/icons/android/values/ic_launcher_background.xml", `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="ic_launcher_background">${bg.toUpperCase()}</color>\n</resources>\n`);
console.log("Android icons written.");
