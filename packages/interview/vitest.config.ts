import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	test: {
		environment: "jsdom",
		globals: true,
		include: ["src/**/*.{test,spec}.{ts,tsx}", "src/**/__tests__/**/*.{test,spec}.{ts,tsx}"],
		exclude: ["**/node_modules/**", "**/dist/**", "**/*.stories.{ts,tsx}"],
	},
});
