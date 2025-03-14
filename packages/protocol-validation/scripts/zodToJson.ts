import chalk from "chalk";
import { execSync } from "node:child_process";
import { readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { ensureError } from "src/utils/ensureError";
import type { ZodType } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

const schemaArg = process.argv[2];
const SCHEMA_DIR = "./src/schemas";

const logError = (msg: string) => console.log(chalk.red(msg));
const logSuccess = (msg: string) => console.log(chalk.green(msg));

export const convertZodToJson = async (zodSchema: ZodType<unknown>, schemaName: string, outputFileName: string) => {
	const convertedSchema = zodToJsonSchema(zodSchema, {
		name: schemaName,
	});

	const outputPath = `${SCHEMA_DIR}/${outputFileName}.json`;

	const jsonSchemaString = JSON.stringify(convertedSchema, null, 2);
	try {
		await writeFile(outputPath, jsonSchemaString);
		logSuccess(`Successfully converted zod schema to json schema: ${outputPath}`);

		// format the json schema with biome
		execSync(`npx biome check ${outputPath} --write `);
		logSuccess(`Successfully linted json schema: ${outputPath}`);
	} catch (e) {
		const error = ensureError(e);
		logError(`Error saving json schema to file: ${error.message}`);
	}
};

const convertSingleSchema = async (schemaPath: string) => {
	// biome-ignore lint/style/noNonNullAssertion: path structure known
	const schemaFileName = basename(schemaPath).split(".")[0]!;

	try {
		const importedSchema = await import(schemaPath).then((module) => module.default);
		await convertZodToJson(importedSchema, "Protocol", schemaFileName);
	} catch (e) {
		const error = ensureError(e);
		logError(`Error converting zod schema to json schema: ${error.message}`);
		return false;
	}

	return true;
};

const convertAllSchemas = async () => {
	try {
		const files = await readdir(SCHEMA_DIR);
		const zodFiles = files.filter((file) => file.endsWith(".zod.ts"));

		if (zodFiles.length === 0) {
			logError(`No *.zod.ts files found in ${SCHEMA_DIR}`);
			return false;
		}

		logSuccess(`Found ${zodFiles.length} zod schema files to convert`);

		let successCount = 0;
		for (const file of zodFiles) {
			const fullPath = join(SCHEMA_DIR, file);
			const success = await convertSingleSchema(fullPath);
			if (success) successCount++;
		}

		logSuccess(`Successfully converted ${successCount}/${zodFiles.length} zod schemas`);
		return successCount > 0;
	} catch (e) {
		const error = ensureError(e);
		logError(`Error reading schema directory: ${error.message}`);
		return false;
	}
};

(async () => {
	try {
		if (schemaArg) {
			// Convert a specific schema
			const success = await convertSingleSchema(schemaArg);
			process.exit(success ? 0 : 1);
		} else {
			// Convert all *.zod.ts files in SCHEMA_DIR
			const success = await convertAllSchemas();
			process.exit(success ? 0 : 1);
		}
	} catch (e) {
		const error = ensureError(e);
		logError(`Unexpected error: ${error.message}`);
		process.exit(1);
	}
})();
