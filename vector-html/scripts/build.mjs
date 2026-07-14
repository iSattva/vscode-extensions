import * as esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const watch = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: [path.join(projectDir, "src", "extension.ts")],
  bundle: true,
  outfile: path.join(projectDir, "dist", "extension.js"),
  external: ["vscode", "chrome-launcher", "puppeteer-core", "turndown"],
  format: "cjs",
  platform: "node",
  target: "node18",
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching...");
} else {
  await esbuild.build(buildOptions);
}
