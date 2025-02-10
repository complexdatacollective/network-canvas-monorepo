import type { Protocol } from "@codaco/shared-consts";
import dotenv from "dotenv";
import type Zip from "jszip";
import JSZip from "jszip";
import { createDecipheriv } from "node:crypto";
import { readdirSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tar from "tar";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateProtocol } from "../index";

dotenv.config();

const checkEnvVariable = (varName: string): string => {
	const value = process.env[varName];
	if (!value) {
		throw new Error(`Missing environment variable: ${varName}`);
	}
	return value;
};

// Utility functions for encryption handling
const decryptFile = async (encryptedBuffer: Buffer) => {
	const key = checkEnvVariable("PROTOCOL_ENCRYPTION_KEY");
	const iv = checkEnvVariable("PROTOCOL_ENCRYPTION_IV");
	const decipher = createDecipheriv("aes-256-cbc", Buffer.from(key, "hex"), Buffer.from(iv, "hex"));
	return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
};

async function downloadAndDecryptProtocols(tempDir: string): Promise<void> {
	const githubToken = checkEnvVariable("GITHUB_TOKEN");

	try {
		// First, get the releases from the test-protocols repo. Note that this requires us to authenticate with a GitHub token.
		const res = await fetch("https://api.github.com/repos/complexdatacollective/test-protocols/releases/latest", {
			headers: {
				Authorization: `Bearer ${githubToken}`,
			},
		});

		const release = await res.json();

		// The test protocols are stored in an asset called "protocols.tar.gz.enc" attached to each release
		const asset = release.assets.find((asset) => asset.name === "protocols.tar.gz.enc");

		// Fetch the asset into a Buffer
		const assetRes = await fetch(asset.url, {
			headers: {
				Authorization: `Bearer ${githubToken}`,
				Accept: "application/octet-stream",
			},
		});

		const encryptedData = await assetRes.arrayBuffer();
		const encryptedBuffer = Buffer.from(encryptedData);

		// Decrypt the file
		const decryptedData = await decryptFile(encryptedBuffer);
		console.log(`${tmpdir}/protocols.tar.gz`);
		await writeFile(join(tempDir, "protocols.tar.gz"), decryptedData);

		// Extract the tar.gz file
		console.log("Extracting protocols...");

		await tar.x({
			file: join(tempDir, "protocols.tar.gz"),
			cwd: tempDir,
		});
	} catch (error) {
		console.error("Error preparing protocols:", error);
		throw error;
	}
}

const getProtocolJsonAsObject = async (zip: Zip) => {
	const protocolString = await zip.file("protocol.json")?.async("string");

	if (!protocolString) {
		throw new Error("protocol.json not found in zip");
	}

	const protocol = await JSON.parse(protocolString);
	return protocol;
};

const validate = async (protocol) => {
	let schemaVersion = undefined;
	if (!protocol.schemaVersion || protocol.schemaVersion === "1.0.0") {
		console.log('schemaVersion is missing or "1.0.0" for protocol');
		schemaVersion = 1;
	}

	return await validateProtocol(protocol, schemaVersion);
};

const extractProtocol = async (protocolPath: string) => {
	const buffer = await readFile(protocolPath);
	const zip = await JSZip.loadAsync(buffer);
	return await getProtocolJsonAsObject(zip);
};

let tempDir: string;
let protocols = [] as Protocol[];

describe("Test protocols", () => {
	beforeAll(async () => {
		// Create temporary directory
		tempDir = await mkdtemp(join(tmpdir(), "test-protocols-"));

		await downloadAndDecryptProtocols(tempDir);

		// Load all the protocols into the context (with parsing and validation data)
		const protocolFolder = join(tempDir, "data");
		const files = readdirSync(protocolFolder).filter((file) => file.endsWith(".netcanvas"));
		expect(files.length).toBeGreaterThan(0);

		// Load all protocols into context
		protocols = await Promise.all(
			files.map(async (protocol) => {
				const protocolPath = join(protocolFolder, protocol);
				const extracted = await extractProtocol(protocolPath);
				return extracted;
			}),
		);
	}, 300000);

	afterAll(async () => {
		// Clean up temporary directory
		await rm(tempDir, { recursive: true, force: true });
	});

	it("should have loaded all protocols", () => {
		expect(protocols.length).toBeGreaterThan(0);
	});

	it("should validate each protocol file", async () => {
		await Promise.all(
			protocols.map(async (protocol) => {
				const result = await validate(protocol);
				expect(result.isValid).toBe(true);
				expect(result.schemaErrors).toEqual([]);
				expect(result.logicErrors).toEqual([]);
			}),
		);
		console.log("All protocols validated successfully", protocols.length);
	});
});
