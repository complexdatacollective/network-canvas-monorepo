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
	}, 300000);

	it("should have loaded protocols", () => {
		expect(protocols.length).toBeGreaterThan(0);
	});

	// Use a single test with detailed logging for each protocol
	it("should validate each protocol individually with detailed logging", async () => {
		const _totalCount = protocols.length;

		for (let i = 0; i < protocols.length; i++) {
			// biome-ignore lint/style/noNonNullAssertion: duh
			const protocol = protocols[i]!;
			const _filename = protocolFilenames[i];
			// Skip if schema version is not supported (only numeric versions 7 and 8 are currently supported)
			// Earlier versions used semver strings which should be ignored
			if (typeof protocol.schemaVersion !== "number" || protocol.schemaVersion < 7 || protocol.schemaVersion > 8) {
				continue;
			}

			const startTime = Date.now();
			const result = await validateProtocol(protocol);
			const _duration = Date.now() - startTime;

			// If there are errors, log them (using unified errors array)
			if (!result.success) {
			}

			// Test each protocol individually but within the same test
			expect(result.success).toBe(true);

			// Migrate and validate protocols with schema version < 8
			if (protocol.schemaVersion < 8) {
				const migratedProtocol = migrateProtocol(protocol);
				const migrationResult = await validateProtocol(migratedProtocol);

				if (!migrationResult.success) {
				}

				expect.soft(migrationResult.success).toBe(true);
			}
		}
	});
});
