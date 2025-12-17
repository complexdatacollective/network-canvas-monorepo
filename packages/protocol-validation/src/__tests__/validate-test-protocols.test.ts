import { beforeAll, describe, expect, it } from "vitest";
import { migrateProtocol, type VersionedProtocol, validateProtocol } from "..";
import { extractProtocol } from "../utils/extractProtocol";
import { downloadAndDecryptProtocols } from "./utils";

// Store protocols and their filenames separately
const protocols: VersionedProtocol[] = [];
const protocolFilenames: string[] = [];

// Skip these tests if GITHUB_TOKEN is not available
const hasGitHubToken = !!process.env.GITHUB_TOKEN;

describe.skipIf(!hasGitHubToken)("Test protocols", () => {
	beforeAll(async () => {
		const protocolBuffers = await downloadAndDecryptProtocols();

		// Extract all protocols and keep track of filenames separately
		for (const [filename, buffer] of protocolBuffers.entries()) {
			const { protocol } = await extractProtocol(buffer);
			protocols.push(protocol);
			protocolFilenames.push(filename);
		}
	}, 300000);

	it("should have loaded protocols", () => {
		expect(protocols.length).toBeGreaterThan(0);
	});

	// Use a single test with detailed logging for each protocol
	it("should validate each protocol individually with detailed logging", async () => {
		for (let i = 0; i < protocols.length; i++) {
			const protocol = protocols[i];
			if (!protocol) {
				continue;
			}

			const filename = protocolFilenames[i];

			const protocolVersion = Number(protocol.schemaVersion ?? 0);

			// Skip if schema version is not supported (only numeric versions 7 and 8 are currently supported)
			// Earlier versions used semver strings which should be ignored
			if (protocolVersion !== 7 && protocolVersion !== 8) {
				// biome-ignore lint/suspicious/noConsole: logging
				console.log(`Skipping unsupported schema version for ${filename}: ${protocol.schemaVersion}`);
				continue;
			}

			// Add default name for v8 protocols that don't have one
			// TODO: Remove this once all test protocols are updated with name field
			const protocolWithName =
				protocolVersion === 8 && !("name" in protocol)
					? { ...protocol, name: filename?.replace(/\.netcanvas$/, "") ?? "Untitled Protocol" }
					: protocol;

			const startTime = Date.now();
			const result = await validateProtocol(protocolWithName);
			const duration = Date.now() - startTime;

			// If there are errors, log them (using unified errors array)
			if (!result.success) {
				// biome-ignore lint/suspicious/noConsole: logging
				console.error(`Validation failed for ${filename} (${duration}ms):`, result.error);
			}

			// Test each protocol individually but within the same test
			expect(result.success).toBe(true);

			// Migrate and validate protocols with schema version < 8
			if (protocol.schemaVersion < 8) {
				const migratedProtocol = migrateProtocol(protocol);
				const migrationResult = await validateProtocol(migratedProtocol);

				if (!migrationResult.success) {
					// biome-ignore lint/suspicious/noConsole: logging
					console.error(`Migration validation failed for ${filename}:`, migrationResult.error);
				}

				expect.soft(migrationResult.success).toBe(true);
			}
		}
	});
});
