#!/usr/bin/env node

/**
 * Build only packages that have changesets or are dependencies of packages with changesets
 * This optimizes CI by avoiding unnecessary builds during publishing
 */

import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function log(message) {
	console.log(`🔧 ${message}`);
}

function getPackagesWithChangesets() {
	const changesetDir = ".changeset";
	const packagePattern = /"@codaco\/[^"]+"/g;
	const changedPackages = new Set();

	try {
		// Read all changeset files
		const changesetFiles = readdirSync(changesetDir)
			.filter((file) => file.endsWith(".md") && file !== "README.md")
			.map((file) => join(changesetDir, file));

		// Extract package names from changeset files
		for (const file of changesetFiles) {
			const content = readFileSync(file, "utf8");
			const matches = content.match(packagePattern);

			if (matches) {
				for (const match of matches) {
					const packageName = match.replace(/"/g, "");
					changedPackages.add(packageName);
				}
			}
		}

		return Array.from(changedPackages);
	} catch (error) {
		log(`Error reading changesets: ${error.message}`);
		return [];
	}
}

function buildPackages(packages) {
	if (packages.length === 0) {
		log("No packages to build");
		return;
	}

	log(`Building packages: ${packages.join(", ")}`);

	for (const packageName of packages) {
		try {
			log(`Building ${packageName} and its dependencies...`);
			// Use pnpm filter with "..." to include dependencies
			execSync(`pnpm --filter "${packageName}..." build`, {
				stdio: "inherit",
				encoding: "utf8",
			});
			log(`✅ Successfully built ${packageName}`);
		} catch (error) {
			log(`❌ Failed to build ${packageName}: ${error.message}`);
			process.exit(1);
		}
	}
}

function main() {
	log("Starting optimized build for publishing...");

	const changedPackages = getPackagesWithChangesets();

	if (changedPackages.length === 0) {
		log("No packages with changesets found. Building all packages as fallback.");
		try {
			execSync("pnpm run build", { stdio: "inherit" });
			log("✅ Built all packages");
		} catch (error) {
			log(`❌ Failed to build all packages: ${error.message}`);
			process.exit(1);
		}
		return;
	}

	log(`Found ${changedPackages.length} packages with changesets:`);
	for (const pkg of changedPackages) {
		log(`  - ${pkg}`);
	}

	buildPackages(changedPackages);

	log("✅ Optimized build completed successfully");
}

main();
