#!/usr/bin/env tsx
/** biome-ignore-all lint/suspicious/noConsole: test logging */
/**
 * Tests redirect rules against a live deployment
 * Verifies that redirects work correctly on the actual site
 */

interface RedirectTest {
	from: string;
	expectedDestination: string;
	description: string;
}

interface TestResult {
	test: RedirectTest;
	success: boolean;
	actualStatus?: number;
	actualLocation?: string;
	error?: string;
}

// Define redirect tests based on netlify.toml
const redirectTests: RedirectTest[] = [
	{
		from: "/",
		expectedDestination: "/en",
		description: "Root redirects to /en",
	},
	{
		from: "/citing-the-software",
		expectedDestination: "/en/desktop/project-information/citing-the-software",
		description: "Legacy citing-the-software URL",
	},
	{
		from: "/reference/protocol-schema-information",
		expectedDestination: "/en/desktop/advanced-topics/protocol-schema-information",
		description: "Protocol schema information redirect (the bug we fixed!)",
	},
	{
		from: "/reference/node-labelling",
		expectedDestination: "/en/desktop/advanced-topics/node-labelling",
		description: "Node labelling redirect",
	},
	{
		from: "/reference/protocol-file-format",
		expectedDestination: "/en/desktop/advanced-topics/protocol-file-format",
		description: "Protocol file format redirect",
	},
	{
		from: "/installation-guide",
		expectedDestination: "/en/desktop/getting-started/installation-guide",
		description: "Installation guide redirect",
	},
	{
		from: "/some-new-page",
		expectedDestination: "/en/desktop/some-new-page",
		description: "Catch-all redirect for new paths",
	},
];

async function testRedirect(baseUrl: string, test: RedirectTest): Promise<TestResult> {
	const url = new URL(test.from, baseUrl);

	try {
		// Use fetch with redirect: 'manual' to get the redirect response
		const response = await fetch(url.toString(), {
			method: "HEAD",
			redirect: "manual",
		});

		const actualStatus = response.status;
		const actualLocation = response.headers.get("location") || "";

		// Normalize locations for comparison (handle both absolute and relative URLs)
		const normalizedExpected = test.expectedDestination;
		const normalizedActual = actualLocation.startsWith("http") ? new URL(actualLocation).pathname : actualLocation;

		// Check if redirect is correct (301 or 302 are both acceptable)
		const isRedirect = actualStatus === 301 || actualStatus === 302 || actualStatus === 308;
		const destinationMatches = normalizedActual === normalizedExpected;

		return {
			test,
			success: isRedirect && destinationMatches,
			actualStatus,
			actualLocation: normalizedActual,
		};
	} catch (error) {
		return {
			test,
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

async function main() {
	const baseUrl = process.env.DEPLOYMENT_URL || process.argv[2];

	if (!baseUrl) {
		console.error("❌ Error: No deployment URL provided");
		console.error("Usage: tsx test-redirects.ts <deployment-url>");
		console.error("   or: DEPLOYMENT_URL=<url> tsx test-redirects.ts");
		process.exit(1);
	}

	console.log(`🧪 Testing redirects on: ${baseUrl}\n`);
	console.log(`Running ${redirectTests.length} redirect tests...\n`);

	const results: TestResult[] = [];

	for (const test of redirectTests) {
		process.stdout.write(`  Testing: ${test.from} ... `);
		const result = await testRedirect(baseUrl, test);
		results.push(result);

		if (result.success) {
			console.log("✅");
		} else {
			console.log("❌");
		}
	}

	// Report results
	console.log(`\n${"=".repeat(80)}\n`);

	const passed = results.filter((r) => r.success);
	const failed = results.filter((r) => !r.success);

	if (failed.length > 0) {
		console.error("❌ Failed redirect tests:\n");
		for (const result of failed) {
			console.error(`  ${result.test.description}`);
			console.error(`    FROM: ${result.test.from}`);
			console.error(`    EXPECTED: ${result.test.expectedDestination}`);
			if (result.error) {
				console.error(`    ERROR: ${result.error}`);
			} else {
				console.error(`    ACTUAL STATUS: ${result.actualStatus}`);
				console.error(`    ACTUAL LOCATION: ${result.actualLocation}`);
			}
			console.error("");
		}
	}

	console.log(`\n✅ Passed: ${passed.length}/${redirectTests.length}`);
	console.log(`❌ Failed: ${failed.length}/${redirectTests.length}\n`);

	if (failed.length > 0) {
		process.exit(1);
	}

	console.log("🎉 All redirect tests passed!\n");
	process.exit(0);
}

main();
