import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			globals: true,
			environment: "jsdom",
			include: ["src/**/*.test.{ts,tsx}"],
			exclude: ["**/node_modules/**", "**/dist/**", "electron/**"],
		},
	}),
);
