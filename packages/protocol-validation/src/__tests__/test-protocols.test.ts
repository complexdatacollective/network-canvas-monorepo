import dotenv from "dotenv";
import gunzipMaybe from "gunzip-maybe";
import type Zip from "jszip";
import JSZip from "jszip";
import { createDecipheriv } from "node:crypto";
import tar from "tar-stream";
import { describe, expect, it } from "vitest";
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

async function downloadAndDecryptProtocols(): Promise<Buffer> {
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
		return await decryptFile(encryptedBuffer);
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

const extractAndValidate = async (protocolBuffer: Buffer) => {
	const zip = await JSZip.loadAsync(protocolBuffer);
	const protocol = await getProtocolJsonAsObject(zip);

	let schemaVersion = undefined;
	if (!protocol.schemaVersion || protocol.schemaVersion === "1.0.0") {
		console.log('schemaVersion is missing or "1.0.0" for', protocol.name);
		schemaVersion = 1;
	}

	return await validateProtocol(protocol, schemaVersion);
};

describe("Test protocols", () => {
	it("should validate each protocol file", async () => {
		const decryptedData = await downloadAndDecryptProtocols();
		const gunzipStream = gunzipMaybe();
		const extractStream = tar.extract();
		const protocolBuffers: Buffer[] = [];

		// extraction
		extractStream.on("entry", async (header, stream, next) => {
			if (header.name.endsWith(".netcanvas")) {
				let protocolData = Buffer.alloc(0);

				stream.on("data", (chunk) => {
					protocolData = Buffer.concat([protocolData, chunk]);
				});

				stream.on("end", async () => {
					protocolBuffers.push(protocolData);
					next();
				});
			} else {
				stream.resume();
				next();
			}
		});

		// validation
		extractStream.on("finish", async () => {
			expect(protocolBuffers.length).toBeGreaterThan(0);
			for (const protocolBuffer of protocolBuffers) {
				const result = await extractAndValidate(protocolBuffer);
				expect(result.isValid).toBe(true);
				expect(result.schemaErrors).toEqual([]);
				expect(result.logicErrors).toEqual([]);
			}
		});

		gunzipStream.end(decryptedData);
		gunzipStream.pipe(extractStream);
	}, 300000);
});
