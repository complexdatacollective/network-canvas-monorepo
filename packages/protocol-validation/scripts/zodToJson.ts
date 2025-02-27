import chalk from "chalk";
import { execSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { ensureError } from "src/utils/ensureError";
import type { ZodType } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

const schemaArg = process.argv[2];
const SCHEMA_DIR = "./src/schemas";

if (!schemaArg) {
	console.error("You must specify a zod schema file to convert to json schema");
	process.exit(1);
}

const schemaPath = schemaArg;
const schemaFileName = basename(schemaPath).split(".")[0];

const logError = (msg: string) => console.log(chalk.red(msg));
const logSuccess = (msg: string) => console.log(chalk.green(msg));

export const convertZodToJson = async (zodSchema: ZodType<unknown>, schemaName: string) => {
	const convertedSchema = zodToJsonSchema(zodSchema, {
		name: schemaName,
		// $refStrategy: "seen", // this reduces the size of the schema but is possibly too permissive
	});

	const outputPath = `${SCHEMA_DIR}/${schemaFileName}.json`;

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

try {
	const { Protocol } = await import(schemaPath);
	convertZodToJson(Protocol, "Protocol");
} catch (e) {
	const error = ensureError(e);
	logError(`Error converting zod schema to json schema: ${error.message}`);
	process.exit(1);
}
