import type { Config } from "tailwindcss";
import sharedConfig from "shared-tailwind-config";

const config: Pick<Config, "content" | "darkMode" | "presets" | "plugins"> = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  presets: [sharedConfig],
  plugins: [require("tailwindcss-animate")],
};

export default config;
