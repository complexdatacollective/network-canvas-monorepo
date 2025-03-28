import { extractProtocol } from "src/utils/extractProtocol";
import { beforeAll, describe, expect, it } from "vitest";
import { type Protocol, validateProtocol } from "../";
import { downloadAndDecryptProtocols } from "./utils";

// Store protocols and their filenames separately
const protocols: Protocol[] = [];
const protocolFilenames: string[] = [];

describe("Test protocols", () => {
	beforeAll(async () => {
		const protocolBuffers = await downloadAndDecryptProtocols();

		// Extract all protocols and keep track of filenames separately
		for (const [filename, buffer] of protocolBuffers.entries()) {
			const protocol = await extractProtocol(buffer);
			protocols.push(protocol);
			protocolFilenames.push(filename);
		}

		console.log(`Loaded ${protocols.length} protocols for testing`);
	}, 300000);

	it("should have loaded protocols", () => {
		expect(protocols.length).toBeGreaterThan(0);
	});

	// Use a single test with detailed logging for each protocol
	it("should validate each protocol individually with detailed logging", async () => {
		const totalCount = protocols.length;

		for (let i = 0; i < protocols.length; i++) {
			// biome-ignore lint/style/noNonNullAssertion: duh
			const protocol = protocols[i]!;
			const filename = protocolFilenames[i];

			console.log(`\n[${i + 1}/${totalCount}] Validating protocol: ${filename}`);

			const startTime = Date.now();
			const result = await validateProtocol(protocol);
			const duration = Date.now() - startTime;

			console.log(`Validation completed in ${duration}ms`);
			console.log(`Result: ${result.isValid ? "✅ Valid" : "❌ Invalid"}`);

			// If there are errors, log them
			if (result.schemaErrors.length > 0) {
				console.log(`Schema errors: ${JSON.stringify(result.schemaErrors, null, 2)}`);
			}

			if (result.logicErrors.length > 0) {
				console.log(`Logic errors: ${JSON.stringify(result.logicErrors, null, 2)}`);
			}

			// Test each protocol individually but within the same test
			expect(result.isValid).toBe(true);
			expect(result.schemaErrors).toEqual([]);
			expect(result.logicErrors).toEqual([]);
		}
	});

	describe("Migration", () => {
		it.todo("All protocols should be compatible with schema 1 after migration");
		it.todo("All protocols should be compatible with schema 2 after migration");
		it.todo("All protocols should be compatible with schema 3 after migration");
		it.todo("All protocols should be compatible with schema 4 after migration");
		it.todo("All protocols should be compatible with schema 5 after migration");
		it.todo("All protocols should be compatible with schema 6 after migration");
		it.todo("All protocols should be compatible with schema 7 after migration");
		it.todo("All protocols should be compatible with schema 8 after migration");
	});

	// // Keep the original test as a summary test
	// it("should validate all protocols successfully", async () => {
	// 	console.log(`Validating all ${protocols.length} protocols in a batch test`);

	// 	const results = await Promise.allSettled(
	// 		protocols.map(async (protocol) => {
	// 			return await validateProtocol(protocol);
	// 		}),
	// 	);

	// 	const validCount = results.filter((r) => r.isValid).length;
	// 	console.log(`Validation summary: ${validCount}/${results.length} protocols validated successfully`);

	// 	// Check if all protocols are valid
	// 	expect(results.every((r) => r.isValid)).toBe(true);
	// 	expect(results.every((r) => r.schemaErrors.length === 0)).toBe(true);
	// 	expect(results.every((r) => r.logicErrors.length === 0)).toBe(true);
	// });
});
