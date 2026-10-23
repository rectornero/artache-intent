import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

// The editor app. Tauri serves `dist/` on desktop and Android.
export default defineConfig({
  root: "app",
  base: "./",
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_CODENAME__: JSON.stringify(pkg.codename ?? "") },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2022",
    // React and the editor change rarely: their own files stay cached across app updates.
    rollupOptions: {
      output: {
        manualChunks: (id) =>
          /node_modules\/(react|react-dom|scheduler)\//.test(id) ? "react" : /node_modules\/(@codemirror|@lezer|codemirror|style-mod|w3c-keyname|crelt)\//.test(id) ? "editor" : undefined,
      },
    },
  },
  server: { port: 5173, strictPort: true },
  clearScreen: false,
});
