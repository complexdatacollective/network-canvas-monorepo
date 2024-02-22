import sharedConfig from "shared-tailwind-config";
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [sharedConfig],
} satisfies Config;
