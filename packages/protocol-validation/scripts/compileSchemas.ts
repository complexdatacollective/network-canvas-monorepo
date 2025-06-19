import Ajv from "ajv";
import standaloneCode from "ajv/dist/standalone/index.js";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

const SCHEMA_SRC_PATH = "./src/schemas/";
const SCHEMA_OUTPUT_PATH = "./src/schemas/compiled";

const ajv = new Ajv({
	code: { source: true, esm: true, lines: true },
	allErrors: true,
	allowUnionTypes: true,
});

ajv.addFormat("integer", /\d+/);
ajv.addFormat("date-time", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);

const isJsonFile = (fileName: string) => extname(fileName) === ".json";
const getBaseName = (schemaFileName: string) => basename(schemaFileName, ".json");

const getSchemas = async (directory: string) => {
	const files = await readdir(directory);
	return files.filter(isJsonFile).map(getBaseName);
};

const compileSchemas = async () => {
	const schemaSrcDirectory = resolve(SCHEMA_SRC_PATH);
	const schemaOutputDirectory = resolve(SCHEMA_OUTPUT_PATH);

	await mkdir(schemaOutputDirectory, { recursive: true });

	const schemas = await getSchemas(schemaSrcDirectory);

	console.log("Compiling schemas...");

	for (const baseSchemaName of schemas) {
		const schemaPath = join(schemaSrcDirectory, `${baseSchemaName}.json`);
		const modulePath = join(schemaOutputDirectory, `${baseSchemaName}.js`);

		// Read the file at schemaPath and parse as JSON
		const schemaContent = await readFile(schemaPath, { encoding: "utf8" });
		const schema = JSON.parse(schemaContent) as Record<string, unknown>;
		const validateFunction = ajv.compile(schema);
		const moduleCode = standaloneCode(ajv, validateFunction);

		await writeFile(modulePath, moduleCode, {});

		console.log(`${baseSchemaName} done.`);
	}
};

compileSchemas().catch((err) => {
	console.error("Error compiling schemas:", err);
	process.exit(1);
});
