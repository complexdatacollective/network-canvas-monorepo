#!/usr/bin/env node
// @ts-check

import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import { errToString, validateProtocol } from "./dist/index.js";

async function main() {
	const [, , filePath, forceSchema = undefined] = process.argv;

	if (!filePath) {
		console.error("Error: Please provide a file path");
		console.log("Usage: npx @codaco/protocol-validation <file-path> [schema-version]");
		process.exit(1);
	}

	/**
	 * @param {string} msg
	 * @returns
	 */
	const error = (msg) => console.log(chalk.red(msg));

	/**
	 * @param {string} msg
	 * @returns
	 */
	const success = (msg) => console.log(chalk.green(msg));

	const absolutePath = path.resolve(filePath);

	try {
		if (!fs.existsSync(absolutePath)) {
			throw new Error(`File not found: ${absolutePath}`);
		}

		// Read as JSON
		const protocol = JSON.parse(fs.readFileSync(absolutePath, "utf8"));

		const result = await validateProtocol(protocol, forceSchema ? Number.parseInt(forceSchema) : undefined);

		if (result.isValid) {
			success("✅ Protocol is valid");
			process.exit(0);
		} else {
			error("❌ Protocol validation failed:");
			const errors = [...result.logicErrors, ...result.schemaErrors];

			for (const e of errors) {
				error(`- ${errToString(e)}`);
			}
			process.exit(1);
		}
	} catch (error) {
		// @ts-ignore
		console.error("Error validating protocol:", error.message);
		process.exit(1);
	}
}

main();
