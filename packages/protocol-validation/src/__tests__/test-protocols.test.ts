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

// Utility functions for encryption handling
const decryptFile = async (encryptedBuffer: Buffer, key: string, iv: string): Promise<Buffer> => {
	const decipher = createDecipheriv("aes-256-cbc", Buffer.from(key, "hex"), Buffer.from(iv, "hex"));
	const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
	return decrypted;
};

const downloadAndDecryptProtocols = async (tempDir: string): Promise<void> => {
	const encryptionKey = process.env.PROTOCOL_ENCRYPTION_KEY;
	const encryptionIv = process.env.PROTOCOL_ENCRYPTION_IV;
	const githubUrl = process.env.ENCRYPTED_PROTOCOLS_URL;

	if (!githubUrl) {
		throw new Error("Encrypted protocols URL must be set in environment variables");
	}

	if (!encryptionKey || !encryptionIv) {
		throw new Error("Encryption key and IV must be set in environment variables");
	}

	try {
		console.log("Downloading encrypted protocols...");
		execSync(
			`curl -L --fail --retry 3 -o ${join(tempDir, "protocols_20250206_141329.tar.gz.enc")} \
			-H "Authorization: token ${process.env.GITHUB_TOKEN}" \
			"${githubUrl}"`,
			{ stdio: "inherit" },
		);

		const encryptedData = await readFile(join(tempDir, "protocols_20250206_141329.tar.gz.enc"));

		// Decrypt the file
		console.log("Decrypting protocols...");

		const decryptedData = await decryptFile(encryptedData, encryptionKey, encryptionIv);
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

		// Skip download in CI if protocols are already present
		if (process.env.CI && process.env.SKIP_PROTOCOL_DOWNLOAD) {
			console.log("Skipping protocol download in CI");
			return;
		}

		await downloadAndDecryptProtocols(tempDir);
	});

	afterAll(() => {
		// Clean up temporary directory
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("should validate each protocol file", async () => {
		const protocolFolder = join(tempDir, "protocols");
		// filter out apple's ._ files
		const files = readdirSync(protocolFolder).filter((file) => file.endsWith(".netcanvas") && !file.startsWith("._"));
		console.log("Found", files.length, "protocol files: ", files);
		// log the size of each file
		for (const file of files) {
			const stats = execSync(`stat -f %z ${join(protocolFolder, file)}`)
				.toString()
				.trim();
			console.log(file, "size:", stats, "bytes");
		}

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
