// R8 privacy invariant: no network-capable module import anywhere in the
// codebase, enforced mechanically rather than by review discipline alone.
// Scans both src/ (fail fast during dev) and dist/ (the artifact that
// actually ships in the VSIX) - for a zero-runtime-dependency extension,
// dist/ is a 1:1 compile of src/, so this also stands in for a scan of
// the packaged VSIX contents.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const FORBIDDEN_MODULES = [
  "http",
  "https",
  "http2",
  "net",
  "dns",
  "tls",
  "dgram",
  "node:http",
  "node:https",
  "node:http2",
  "node:net",
  "node:dns",
  "node:tls",
  "node:dgram",
  "axios",
  "node-fetch",
  "undici",
  "ws",
  "request",
  "got",
  "superagent",
];

const REQUIRE_OR_IMPORT_FROM = new RegExp(
  `(?:require\\(\\s*['"](${FORBIDDEN_MODULES.map(escapeRe).join("|")})['"]\\s*\\)` +
    `|from\\s+['"](${FORBIDDEN_MODULES.map(escapeRe).join("|")})['"]` +
    `|import\\(\\s*['"](${FORBIDDEN_MODULES.map(escapeRe).join("|")})['"]\\s*\\))`
);

const FETCH_USAGE = /\bfetch\s*\(/;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function walk(dir, exts, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, exts, out);
    } else if (exts.some((ext) => entry.name.endsWith(ext)) && !entry.name.endsWith(".d.ts") && !entry.name.endsWith(".map")) {
      out.push(full);
    }
  }
}

function scanDir(dir, exts) {
  const files = [];
  walk(dir, exts, files);
  const violations = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const importMatch = line.match(REQUIRE_OR_IMPORT_FROM);
      if (importMatch) {
        violations.push({ file, line: i + 1, text: line.trim(), reason: "network-capable import" });
      }
      if (FETCH_USAGE.test(line)) {
        violations.push({ file, line: i + 1, text: line.trim(), reason: "fetch() usage" });
      }
    });
  }
  return violations;
}

const srcViolations = scanDir(path.join(projectDir, "src"), [".ts"]);
const distDir = path.join(projectDir, "dist");
const distViolations = fs.existsSync(distDir) ? scanDir(distDir, [".js"]) : [];

const all = [...srcViolations, ...distViolations];

if (all.length > 0) {
  console.error("Privacy lint FAILED - network-capable code found:\n");
  for (const v of all) {
    console.error(`  ${path.relative(projectDir, v.file)}:${v.line}  [${v.reason}]  ${v.text}`);
  }
  console.error(`\n${all.length} violation(s). Vector AI Pulse must ship with zero network capability - see PRD R8.`);
  process.exit(1);
}

if (!fs.existsSync(distDir)) {
  console.warn("Privacy lint: dist/ not found, only scanned src/ - run `npm run build` first to also check the shipped artifact.");
}

console.log("Privacy lint passed: no network-capable imports or fetch() usage found.");
