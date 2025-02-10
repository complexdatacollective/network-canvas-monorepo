import dotenv from "dotenv";
import gunzip from "gunzip-maybe";
import type Zip from "jszip";
import JSZip from "jszip";
import { createDecipheriv } from "node:crypto";
import { Readable } from "node:stream";
import tarStream from "tar-stream";
import { beforeAll, describe, expect, it } from "vitest";
import { validateProtocol } from "../index";
import type { Protocol } from "../schemas/src/8.zod";

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

async function downloadAndDecryptProtocols(): Promise<Map<string, Buffer>> {
	const githubToken = checkEnvVariable("GITHUB_TOKEN");
	const protocols = new Map<string, Buffer>();

	try {
		// First, get the releases from the test-protocols repo. Note that this requires us to authenticate with a GitHub token.
		const res = await fetch("https://api.github.com/repos/complexdatacollective/test-protocols/releases/latest", {
			headers: {
				Authorization: `Bearer ${githubToken}`,
			},
		});

		const release = await res.json();

		// The test protocols are stored in an asset called "protocols.tar.gz.enc" attached to each release
		const asset = release.assets.find((asset: { name: string }) => asset.name === "protocols.tar.gz.enc");

		// Fetch the asset into a Buffer
		const assetRes = await fetch(asset.url, {
			headers: {
				Authorization: `Bearer ${githubToken}`,
				Accept: "application/octet-stream",
			},
		});

		const encryptedData = await assetRes.arrayBuffer();
		const decryptedData = await decryptFile(Buffer.from(encryptedData));

		const readStream = Readable.from(decryptedData);
		const extract = tarStream.extract();

		await new Promise((resolve, reject) => {
			extract.on("entry", (header, stream, next) => {
				if (header.name.startsWith("data/") && header.name.endsWith(".netcanvas")) {
					const chunks: Buffer[] = [];
					stream.on("data", (chunk) => chunks.push(chunk));
					stream.on("end", () => {
						const fileName = header.name.split("/").pop() as string;
						protocols.set(fileName, Buffer.concat(chunks));
						next();
					});
				} else {
					stream.on("end", next);
				}
				stream.resume();
			});

			extract.on("finish", resolve);
			extract.on("error", reject);

			readStream.pipe(gunzip()).pipe(extract);
		});

		return protocols;
	} catch (error) {
		console.error("Error preparing protocols:", error);
		throw error;
	}
}

const getProtocolJsonAsObject = async (zip: Zip): Promise<Protocol> => {
	const protocolString = await zip.file("protocol.json")?.async("string");

	if (!protocolString) {
		throw new Error("protocol.json not found in zip");
	}

	return JSON.parse(protocolString);
};

const validate = async (protocol: Protocol) => {
	let schemaVersion = undefined;
	if (!protocol.schemaVersion || protocol.schemaVersion === "1.0.0") {
		console.log('schemaVersion is missing or "1.0.0" for protocol');
		schemaVersion = 1;
	}

	return await validateProtocol(protocol, schemaVersion);
};

const extractProtocol = async (protocolBuffer: Buffer): Promise<Protocol> => {
	const zip = await JSZip.loadAsync(protocolBuffer);
	return await getProtocolJsonAsObject(zip);
};

let protocols: Protocol[] = [];

describe("Test protocols", () => {
	beforeAll(async () => {
		const protocolBuffers = await downloadAndDecryptProtocols();

		// set protocols in context so that they can be accessed in tests
		protocols = await Promise.all(
			Array.from(protocolBuffers.values()).map(async (buffer) => {
				return await extractProtocol(buffer);
			}),
		);
	}, 300000);

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
