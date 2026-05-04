import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./specs",
	snapshotDir: "./visual-snapshots",
	snapshotPathTemplate: "{snapshotDir}/{projectName}/{arg}{ext}",

	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 30_000,

	reporter: [
		["line"],
		["html", { outputFolder: "./playwright-report", open: "never" }],
		["json", { outputFile: "./test-results/results.json" }],
	],

	expect: {
		timeout: 10_000,
		toHaveScreenshot: {
			animations: "disabled",
			maxDiffPixels: 250,
		},
	},

	use: {
		baseURL: "http://localhost:4101",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
		actionTimeout: 5_000,
		navigationTimeout: 10_000,
		viewport: { width: 1920, height: 1080 },
		contextOptions: { reducedMotion: "reduce" },
	},

	webServer: [
		{
			command: "pnpm --filter @codaco/interview exec vite --config e2e/host/vite.config.ts",
			port: 4101,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
		},
		{
			command: "pnpm --filter @codaco/interview exec tsx e2e/helpers/assetServer.ts",
			port: 4200,
			reuseExistingServer: !process.env.CI,
			timeout: 30_000,
		},
	],

	projects: [
		{ name: "chromium", use: devices["Desktop Chrome"] },
		{ name: "firefox", use: devices["Desktop Firefox"] },
		{ name: "webkit", use: devices["Desktop Safari"] },
	],
});
