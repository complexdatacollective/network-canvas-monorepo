import chalk from "chalk";
import jsonRefs from "json-refs";
import jsonSchemaToZod, { type JsonSchema } from "json-schema-to-zod";
import { exec } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { ensureError } from "src/utils/ensureError";

const schemaArg = process.argv[2];
const SCHEMA_DIR = "./src/schemas";

if (!schemaArg) {
	console.error("You must specify a json schema file to convert to zod schema");
	process.exit(1);
}

const schemaPath = schemaArg;
const schemaFileName = basename(schemaPath).split(".")[0];

const logError = (msg: string) => console.log(chalk.red(msg));
const logSuccess = (msg: string) => console.log(chalk.green(msg));

export const convertJsonToZod = async (jsonSchema: JsonSchema) => {
	const convertedSchema = jsonSchemaToZod(jsonSchema, {
		name: "Protocol",
		module: "esm",
		type: true,
		depth: 10,
	});

	const outputPath = `${SCHEMA_DIR}/${schemaFileName}.zod.ts`;

	try {
		await writeFile(outputPath, convertedSchema);
		logSuccess(`Successfully converted json schema to zod schema: ${outputPath}`);

		// using --unsafe flag to force fixing unused template literals
		// could ignore this rule, or these files instead.
		await exec(`npx biome check ${outputPath} --write --unsafe`, (error, stdout) => {
			if (error) {
				logError(`Error running biome check: ${error.message}`);
				return;
			}
			logSuccess(`Successfully ran biome check: ${stdout}`);
		});
	} catch (e) {
		const error = ensureError(e);
		logError(`Error saving zod schema to file: ${error.message}`);
	}
};

try {
	const schema = await import(schemaPath);
	const resolvedSchema = await jsonRefs.resolveRefs(schema.default);

	convertJsonToZod(resolvedSchema.resolved);
} catch (e) {
	const error = ensureError(e);
	logError(`Error converting json schema to zod schema: ${error.message}`);
	process.exit(1);
}
