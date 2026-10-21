import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The editor app. Tauri serves `dist/` on desktop and Android.
export default defineConfig({
  root: "app",
  base: "./",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true, target: "es2022" },
  server: { port: 5173, strictPort: true },
  clearScreen: false,
});
