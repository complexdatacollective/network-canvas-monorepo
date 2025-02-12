import chalk from "chalk";
import { writeFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ZodType } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

const schemaArg = process.argv[2];
const SCHEMA_DIR = "./src/schemas/src";

if (!schemaArg) {
	console.error("You must specify a zod schema file to convert to json schema");
	process.exit(1);
}

const schemaPath = schemaArg;
const schemaFileName = basename(schemaPath).split(".")[0];

const logError = (msg: string) => console.log(chalk.red(msg));
const logSuccess = (msg: string) => console.log(chalk.green(msg));

export const convertZodToJson = async (zodSchema: ZodType<unknown>, schemaName: string) => {
	console.log("zodSchema", zodSchema);
	const convertedSchema = zodToJsonSchema(zodSchema, schemaName);

	const outputPath = `${SCHEMA_DIR}/${schemaFileName}.json`;

	const jsonSchemaString = JSON.stringify(convertedSchema, null, 2);
	try {
		await writeFile(outputPath, jsonSchemaString);
		logSuccess(`Successfully converted zod schema to json schema: ${outputPath}`);
	} catch (error) {
		logError(`Error saving json schema to file: ${error.message}`);
	}
};

try {
	const { Protocol } = await import(schemaPath);
	convertZodToJson(Protocol, "Protocol");
} catch (error) {
	logError(`Error converting zod schema to json schema: ${error.message}`);
	process.exit(1);
}
