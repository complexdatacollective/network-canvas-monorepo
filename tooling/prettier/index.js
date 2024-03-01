import { fileURLToPath } from "url";

/** @typedef {import("prettier").Config} PrettierConfig */
/** @typedef {import("prettier-plugin-tailwindcss").PluginOptions} TailwindConfig */

/** @type { PrettierConfig | SortImportsConfig | TailwindConfig } */
const config = {
  plugins: [
    "prettier-plugin-tailwindcss",
  ],
  tailwindConfig: fileURLToPath(
    new URL("../../tooling/tailwind/fresco.ts", import.meta.url),
  ),
  tailwindFunctions: ["cn", "cva"],
  printWidth: 80,
  quoteProps: 'consistent',
  singleQuote: true,
};

export default config;
