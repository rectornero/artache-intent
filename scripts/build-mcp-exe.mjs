// The connector as one program with its own runtime (Bun), so the Windows app
// can ship it and nobody needs Node: dist-mcp/intent-mcp.exe
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const target = process.argv[2] ?? "bun-windows-x64";
const out = target.includes("windows") ? "dist-mcp/intent-mcp.exe" : "dist-mcp/intent-mcp";
writeFileSync("src/mcp-spec.gen.ts", `export default ${JSON.stringify(readFileSync("docs/SPEC.md", "utf8"))};\n`);
const r = spawnSync("npx", ["-y", "bun@1.3.1", "build", "src/mcp-exe.ts", "--compile", `--target=${target}`, "--outfile", out], { stdio: "inherit", shell: process.platform === "win32" });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(out);
