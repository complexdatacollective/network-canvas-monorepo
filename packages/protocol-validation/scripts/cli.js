#!/usr/bin/env node

// @ts-check

import fs from "node:fs";
import path from "node:path";
import { extractProtocol, validateProtocol } from "../dist/index.js";

async function main() {
	const [, , filePath] = process.argv;

	if (!filePath) {
		process.exit(1);
	}

	/**
	 * @param {string} msg
	 * @returns
	 */
	const error = (_msg) => {};

	/**
	 * @param {string} msg
	 * @returns
	 */
	const success = (_msg) => {};

	const absolutePath = path.resolve(filePath);

	try {
		if (!fs.existsSync(absolutePath)) {
			throw new Error(`File not found: ${absolutePath}`);
		}

		// Check if the file is a .netcanvas or a .json file
		if (!(absolutePath.endsWith(".netcanvas") || absolutePath.endsWith(".json"))) {
			error("File must be a .netcanvas or .json file");
			process.exit(1);
		}

		let protocol;

		// If it is a .netcanvas, extract the protocol.json inside it to os temp folder
		if (absolutePath.endsWith(".netcanvas")) {
			const fileBuffer = fs.readFileSync(absolutePath);
			protocol = await extractProtocol(fileBuffer);
		} else {
			// Read as JSON
			protocol = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
		}

		const result = await validateProtocol(protocol);

		if (result.success) {
			success("✅ Protocol is valid");
			process.exit(0);
		} else {
			error("❌ Protocol validation failed:");
			process.exit(1);
		}
	} catch (_error) {
		process.exit(1);
	}
}

main();
