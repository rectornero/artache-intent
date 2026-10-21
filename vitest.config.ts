import { defineConfig } from "vitest/config";

// Tests run from the repo root; vite.config.ts points at the app folder.
export default defineConfig({ test: { root: ".", include: ["tests/**/*.test.ts"] } });
