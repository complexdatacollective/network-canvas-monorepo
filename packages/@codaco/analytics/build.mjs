import dts from "bun-plugin-dts";
import { buildSchemas } from "./scripts/buildSchemas";

await buildSchemas();

await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  minify: true,
  plugins: [dts()],
});
