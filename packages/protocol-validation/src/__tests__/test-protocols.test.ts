import dotenv from "dotenv";
import type Zip from "jszip";
import JSZip from "jszip";
import { createDecipheriv } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
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
				Accept: 'application/octet-stream' 
			},
		});

		const encryptedData = await assetRes.arrayBuffer();
		console.log(encryptedData);
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
	beforeAll(async () => {
		// Create temporary directory
		tempDir = await mkdtemp(join(tmpdir(), "test-protocols-"));

		await downloadAndDecryptProtocols(tempDir);
	});

	afterAll(async () => {
		// Clean up temporary directory
		await rm(tempDir, { recursive: true, force: true });
	});

	it("should validate each protocol file", async () => {
		const protocolFolder = join(tempDir, "protocols");
		// filter for .netcanvas files and remove apple's ._ AppleDouble files
		const unfilteredFiles = await readdir(protocolFolder);
		const files = unfilteredFiles.filter((file) => file.endsWith(".netcanvas") && !file.startsWith("._"));
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
