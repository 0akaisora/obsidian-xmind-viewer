import esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const ctx = await esbuild.context({
  entryPoints: ["src/main.js"],
  bundle: true,
  external: ["obsidian", "electron", "path"],
  outfile: "main.js",
  format: "cjs",
  platform: "node",
  target: "es2021",
  banner: { js: '"use strict";' },
  logLevel: "info",
});

if (watch) {
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
