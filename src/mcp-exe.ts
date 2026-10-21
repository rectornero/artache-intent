// Entry point for the standalone connector program: the format reference is
// baked in (written by scripts/build-mcp-exe.mjs), then the server starts.
import spec from "./mcp-spec.gen.ts";

(globalThis as { __INTENT_SPEC_TEXT__?: string }).__INTENT_SPEC_TEXT__ = spec;
await import("./mcp.ts");
