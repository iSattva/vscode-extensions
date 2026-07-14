import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));

// Isolated staging dir so packaging never touches the dev node_modules
// (which has devDependencies like esbuild/typescript mixed in with the
// runtime deps that actually need to ship).
const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), "vector-markdown-package-"));

console.log("Staging in", stageDir);

const filesToCopy = [
  "package.json",
  "package-lock.json",
  "CHANGELOG.md",
  "LICENSE",
  "README.md",
  "USAGE.md",
  "sample.md",
  "dist",
  "media",
  "themes",
];

for (const name of filesToCopy) {
  if (name === "package.json") continue; // written separately below, with prepublish neutralized
  const src = path.join(projectDir, name);
  if (!fs.existsSync(src)) continue;
  const dest = path.join(stageDir, name);
  fs.cpSync(src, dest, { recursive: true });
}

// dist/ is already built and copied above - vsce's automatic
// "vscode:prepublish" hook would otherwise try to rebuild from src/,
// which doesn't exist in this staging dir.
const stagedPkg = { ...pkg, scripts: { ...pkg.scripts, "vscode:prepublish": "node -e \"\"" } };
fs.writeFileSync(path.join(stageDir, "package.json"), JSON.stringify(stagedPkg, null, 2));

console.log("Installing production dependencies only...");
execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], {
  cwd: stageDir,
  stdio: "inherit",
  shell: true,
});

console.log("Packaging...");
// node_modules here is already production-only (npm install --omit=dev
// above), so vsce should ship it as-is rather than trying its own
// dependency detection (or, with --no-dependencies, excluding it).
const vsceBin = path.join(projectDir, "node_modules", ".bin", process.platform === "win32" ? "vsce.cmd" : "vsce");
execFileSync(vsceBin, ["package"], {
  cwd: stageDir,
  stdio: "inherit",
  shell: true,
});

const vsixName = `${pkg.name}-${pkg.version}.vsix`;
fs.copyFileSync(path.join(stageDir, vsixName), path.join(projectDir, vsixName));
fs.rmSync(stageDir, { recursive: true, force: true });

console.log("Wrote", path.join(projectDir, vsixName));
