// Bundles the MCP server into one file that runs on plain Node: dist-mcp/intent-mcp.mjs
import { build } from "esbuild";
import { readFileSync } from "node:fs";

await build({
  entryPoints: ["src/mcp.ts"],
  outfile: "dist-mcp/intent-mcp.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  define: { __INTENT_SPEC__: JSON.stringify(readFileSync("docs/SPEC.md", "utf8")) },
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "warning",
});
console.log("dist-mcp/intent-mcp.mjs");
