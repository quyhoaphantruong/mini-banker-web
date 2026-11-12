import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const names = ["launch", "customers", "mandates"];

await build({
  absWorkingDir: root,
  entryPoints: Object.fromEntries(names.map((n) => [n, `src/lambda/${n}.ts`])),
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  banner: {
    js: "import { createRequire as _cr } from 'node:module'; const require = _cr(import.meta.url);",
  },
  logLevel: "info",
});
