import { createDecipheriv } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import dotenv from "dotenv";
import gunzip from "gunzip-maybe";
import tarStream from "tar-stream";

dotenv.config();

const checkEnvVariable = (varName: string): string => {
	const value = process.env[varName];
	if (!value) {
		throw new Error(`Missing environment variable: ${varName}`);
	}
	return value;
};

const ensureFolderExists = (folderPath: string) => {
	if (!fs.existsSync(folderPath)) {
		fs.mkdirSync(folderPath);
	}
};

const checkCache = (): number => {
	const cacheFilePath = path.join(__dirname, ".cache");
	if (!fs.existsSync(cacheFilePath)) {
		return 0;
	}
	const cache = fs.readFileSync(cacheFilePath, "utf8");
	return Number.parseInt(cache);
};

const updateCache = (size: number) => {
	const cacheFilePath = path.join(__dirname, ".cache");
	fs.writeFileSync(cacheFilePath, size.toString());
};

// Utility functions for encryption handling
const decryptFile = async (encryptedBuffer: Buffer) => {
	const key = checkEnvVariable("PROTOCOL_ENCRYPTION_KEY");
	const iv = checkEnvVariable("PROTOCOL_ENCRYPTION_IV");
	const decipher = createDecipheriv("aes-256-cbc", Buffer.from(key, "hex"), Buffer.from(iv, "hex"));
	return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
};

export async function downloadAndDecryptProtocols(): Promise<Map<string, Buffer>> {
	const githubToken = checkEnvVariable("GITHUB_TOKEN");
	const protocols = new Map<string, Buffer>();

	const downloadFolder = path.join(__dirname, "data");
	ensureFolderExists(downloadFolder);

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

		const assetSize = asset.size;

		// Check the cache size and compare it with the current asset size
		const cacheSize = checkCache();
		if (cacheSize !== assetSize) {
			console.log("Cache size mismatch. Downloading new protocols...");

			// If sizes are different, delete the existing data directory
			const dataFolder = path.join(__dirname, "data");
			if (fs.existsSync(dataFolder)) {
				fs.rmSync(dataFolder, { recursive: true, force: true });
			}

			// Fetch the asset into a Buffer
			const assetRes = await fetch(asset.url, {
				headers: {
					Authorization: `Bearer ${githubToken}`,
					Accept: "application/octet-stream",
				},
			});

			const encryptedData = await assetRes.arrayBuffer();
			const encryptedBuffer = Buffer.from(encryptedData);

			const decryptedData = await decryptFile(encryptedBuffer);

			// Save the decrypted data to the /data folder
			ensureFolderExists(dataFolder);
			const decryptedFilePath = path.join(dataFolder, "protocols.tar.gz");
			fs.writeFileSync(decryptedFilePath, decryptedData);

			updateCache(assetSize);
		} else {
			console.log("Cache is up to date. Skipping download.");
		}

		const decryptedFilePath = path.join(downloadFolder, "protocols.tar.gz");
		const decryptedData = fs.readFileSync(decryptedFilePath);

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
