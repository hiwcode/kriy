// Copies the repo-root `docs/` markdown into `public/docs-md/` so the docs
// pages can fetch them as static assets. Reading `../docs` at runtime does not
// work on Vercel because that folder lives outside the deployment root and is
// never bundled into the build. Runs on `predev` and `prebuild`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "..", "..", "docs");
const DEST = path.resolve(__dirname, "..", "public", "docs-md");

if (!fs.existsSync(SRC)) {
  console.warn(`[copy-docs] source not found: ${SRC} — skipping copy.`);
  process.exit(0);
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.cpSync(SRC, DEST, { recursive: true });
console.log(`[copy-docs] copied ${SRC} -> ${DEST}`);
