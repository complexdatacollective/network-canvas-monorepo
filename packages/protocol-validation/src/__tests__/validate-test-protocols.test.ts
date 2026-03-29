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

	it("should validate each protocol individually with detailed logging", async () => {
		for (let i = 0; i < protocols.length; i++) {
			const protocol = protocols[i];
			if (!protocol) {
				continue;
			}

			const filename = protocolFilenames[i];
			const protocolVersion = Number(protocol.schemaVersion ?? 0);

			// Skip protocols with non-numeric schema versions (e.g. semver strings like "1.0.0")
			if (!Number.isInteger(protocolVersion) || protocolVersion < 1 || protocolVersion > 9) {
				// biome-ignore lint/suspicious/noConsole: logging
				console.log(`Skipping unsupported schema version for ${filename}: ${protocol.schemaVersion}`);
				continue;
			}

			const protocolName = filename?.replace(/\.netcanvas$/, "") ?? "Unknown Protocol";

			if (protocolVersion === 9) {
				// Validate v9 protocols directly
				const protocolWithName = !("name" in protocol) ? { ...protocol, name: protocolName } : protocol;

				const startTime = Date.now();
				const result = await validateProtocol(protocolWithName);
				const duration = Date.now() - startTime;

				if (!result.success) {
					// biome-ignore lint/suspicious/noConsole: logging
					console.error(`Validation failed for ${filename} (${duration}ms):`, result.error);
				}

				expect(result.success).toBe(true);
			} else {
				// For versions 1-8, migrate to v9 then validate
				const migratedProtocol = migrateProtocol(protocol, undefined, { name: protocolName });
				const migrationResult = await validateProtocol(migratedProtocol);

				if (!migrationResult.success) {
					// biome-ignore lint/suspicious/noConsole: logging
					console.error(
						`Migration validation failed for ${filename} (v${protocolVersion} → v9):`,
						migrationResult.error,
					);
				}

				expect(migrationResult.success).toBe(true);
			}
		}
	});
});
