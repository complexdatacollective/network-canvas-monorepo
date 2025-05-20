import dotenv from "dotenv";
dotenv.config();

import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: "./db/schema.ts",
	out: "./drizzle",
	driver: "pglite",
	dbCredentials: {
		// biome-ignore lint/style/noNonNullAssertion: env variable must be defined
		url: process.env.POSTGRES_URL!,
	},
	verbose: true,
	strict: true,
});
