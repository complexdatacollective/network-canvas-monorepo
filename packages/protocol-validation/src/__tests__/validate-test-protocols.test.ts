import { extractProtocol } from "src/utils/extractProtocol";
import { beforeAll, describe, expect, it } from "vitest";
import { migrateProtocol, type Protocol, validateProtocol } from "..";
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
			// Skip if schema version is not supported (only numeric versions 7 and 8 are currently supported)
			// Earlier versions used semver strings which should be ignored
			if (typeof protocol.schemaVersion !== "number" || protocol.schemaVersion < 7 || protocol.schemaVersion > 8) {
				console.log(`Skipping protocol ${filename} (schema version ${protocol.schemaVersion})`);
				continue;
			}

			console.log(`\n[${i + 1}/${totalCount}] Validating protocol: ${filename}`);

			const startTime = Date.now();
			const result = await validateProtocol(protocol);
			const duration = Date.now() - startTime;

			console.log(`Validation completed in ${duration}ms`);
			console.log(`Result: ${result.success ? "✅ Valid" : "❌ Invalid"}`);

			// If there are errors, log them (using unified errors array)
			if (!result.success) {
				console.log(`Validation errors: ${JSON.stringify(result.error || "No error details available", null, 2)}`);
			}

			// Test each protocol individually but within the same test
			expect(result.success).toBe(true);

			// Migrate and validate protocols with schema version < 8
			if (protocol.schemaVersion < 8) {
				const migratedProtocol = migrateProtocol(protocol);
				const migrationResult = await validateProtocol(migratedProtocol);

				console.log(`Migration result: ${migrationResult.success ? "✅ Valid" : "❌ Invalid"}`);

				if (!migrationResult.success) {
					console.log(`Migration validation errors: ${JSON.stringify(migrationResult.error, null, 2)}`);
				}

				expect.soft(migrationResult.success).toBe(true);
			}
		}
	});
});
