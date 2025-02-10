import dotenv from "dotenv";
import type Zip from "jszip";
import JSZip from "jszip";
import { execSync } from "node:child_process";
import { createDecipheriv } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
	const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
	return decrypted;
};


async function downloadAndDecryptProtocols(tempDir: string): Promise<void> {
	const githubToken = checkEnvVariable("GITHUB_TOKEN");

	try {
		console.log("Downloading encrypted protocols...");
// First, get the releases from the test-protocols repo. Note that this requires us to authenticate with a GitHub token.
	const res = await fetch(
		"https://api.github.com/repos/complexdatacollective/test-protocols/releases/latest",
		{
			headers: {
				Authorization: `token ${githubToken}`,
			},
		},
	);

	const release = await res.json();

	console.log(release);

	// The test protocols are stored in an asset called "protocols.tar.gz.enc" attached to each release
	const asset = release.assets.find((asset) => asset.name === "protocols.tar.gz.enc");

	console.log('Found asset:', asset);

	// Fetch the asset into a Buffer
	const assetRes = await fetch(
		asset.browser_download_url,
		{
			headers: {
				Authorization: `token ${githubToken}`,
			},
		},
	);

	console.log('Fetched asset:', assetRes);

		const encryptedData = await assetRes.arrayBuffer();
		const encryptedBuffer = Buffer.from(encryptedData);

		// Decrypt the file
		console.log("Decrypting protocols...");

		const decryptedData = await decryptFile(encryptedBuffer);
		await writeFile(join(tempDir, "protocols.tar.gz"), decryptedData);

		// Extract the tar.gz file
		console.log("Extracting protocols...");
		execSync(`tar -xzf ${join(tempDir, "protocols.tar.gz")} -C ${tempDir}`);
	} catch (error) {
		console.error("Error preparing protocols:", error);
		throw error;
	}
};

const getProtocolJsonAsObject = async (zip: Zip) => {
	const protocolString = await zip.file("protocol.json")?.async("string");

	if (!protocolString) {
		throw new Error("protocol.json not found in zip");
	}

	const protocol = await JSON.parse(protocolString);
	return protocol;
};

const extractAndValidate = async (protocolPath: string) => {
	const buffer = await readFile(protocolPath);
	const zip = await JSZip.loadAsync(buffer);
	const protocol = await getProtocolJsonAsObject(zip);

	let schemaVersion = undefined;
	if (!protocol.schemaVersion || protocol.schemaVersion === "1.0.0") {
		console.log('schemaVersion is missing or "1.0.0" for', protocolPath);
		schemaVersion = 1;
	}

	return await validateProtocol(protocol, schemaVersion);
};

// Create temporary directory for test protocols
let tempDir: string;

describe("Test protocols", () => {
	it.todo("should validate all test protocols");

	beforeAll(async () => {
		// Create temporary directory
		tempDir = mkdtempSync(join(tmpdir(), "test-protocols-"));

		await downloadAndDecryptProtocols(tempDir);
	});

	afterAll(() => {
		// Clean up temporary directory
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("should validate each protocol file", async () => {
		const protocolFolder = join(tempDir, "protocols");
		// filter for .netcanvas files and remove apple's ._ AppleDouble files
		const files = readdirSync(protocolFolder).filter((file) => file.endsWith(".netcanvas") && !file.startsWith("._"));
		console.log("Found", files.length, "protocol files");
		expect(files.length).toBeGreaterThan(0);

		for (const protocol of files) {
			const protocolPath = join(protocolFolder, protocol);
			const result = await extractAndValidate(protocolPath);

			expect(result.isValid).toBe(true);
			expect(result.schemaErrors).toEqual([]);
			expect(result.logicErrors).toEqual([]);
		}
	});
});
