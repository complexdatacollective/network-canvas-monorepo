// @ts-check
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Constants
const NEXT_APP_PATH = "apps/fresco";
const SYNC_DIR = process.env.SYNC_OUTPUT_DIR || "sync-output"; // Ensure the value is not undefined
const OUTPUT_DIR = join(process.cwd(), SYNC_DIR);
const PACKAGES_DIRS = ["packages", "tooling"];

// Tracks processed packages to avoid duplicates
const processedPackages = new Set();

/**
 * Find all workspace dependencies for a package
 * @param {string} packageJsonPath - Path to package.json
 * @returns {Promise<Object>} - Object with packageName -> packagePath mappings
 */
async function findWorkspaceDependencies(packageJsonPath) {
	try {
		const pkgContent = await readFile(packageJsonPath, "utf8");
		const pkg = JSON.parse(pkgContent);
		const result = {};

		// Check both dependencies and devDependencies
		for (const depType of ["dependencies", "devDependencies"]) {
			if (!pkg[depType]) continue;

			for (const [dep, version] of Object.entries(pkg[depType])) {
				if (version.startsWith("workspace:")) {
					// For a workspace dependency, determine its path in the monorepo
					const packageName = dep.split("/").pop() || dep;

					// Try to find the package in standard locations (packages or tooling)
					let packagePath = null;

					for (const dir of PACKAGES_DIRS) {
						console.log(`Checking ${dir}/${packageName}`);
						const possiblePath = join(process.cwd(), dir, packageName);
						try {
							const packageStat = await stat(join(possiblePath, "package.json"));
							if (packageStat) {
								packagePath = possiblePath;
								break;
							}
						} catch (err) {
							console.info(`Package ${packageName} not found in ${dir}. Trying next dir`, err.message);
						}
					}

					if (packagePath) {
						result[dep] = packagePath;
					} else {
						console.warn(`Workspace dependency ${dep} not found in standard locations`);
					}
				}
			}
		}

		return result;
	} catch (err) {
		console.error(`Error reading ${packageJsonPath}:`, err);
		return {};
	}
}

/**
 * Recursively collect all workspace dependencies
 * @param {string} packagePath - Path to the package
 * @returns {Promise<Object>} - Object with all dependencies (packageName -> packagePath)
 */
async function collectAllDependencies(packagePath) {
	// Extract package name from package.json
	let packageName;
	try {
		const pkgContent = await readFile(join(packagePath, "package.json"), "utf8");
		packageName = JSON.parse(pkgContent).name;
	} catch (err) {
		console.error(`Error reading package.json at ${packagePath}:`, err);
		return {};
	}

	// Skip if already processed
	if (processedPackages.has(packageName)) {
		return {};
	}

	processedPackages.add(packageName);

	const packageJsonPath = join(packagePath, "package.json");
	const directDeps = await findWorkspaceDependencies(packageJsonPath);

	// Start with direct dependencies
	const allDeps = { ...directDeps };

	// Recursively collect transitive dependencies
	for (const [_dep, depPath] of Object.entries(directDeps)) {
		const transitiveDeps = await collectAllDependencies(depPath);
		Object.assign(allDeps, transitiveDeps);
	}

	return allDeps;
}

/**
 * Update package.json to use local file paths instead of workspace references
 * @param {string} packageJsonPath - Path to package.json
 * @param {string} relativePath - Relative path to packages directory
 * @param {Array} packageNames - Array of workspace package names
 */
async function updatePackageJson(packageJsonPath, relativePath, packageNames) {
	const pkgContent = await readFile(packageJsonPath, "utf8");
	const pkg = JSON.parse(pkgContent);
	let modified = false;

	// Function to update dependencies in a dependency object
	const updateDeps = (depObj) => {
		if (!depObj) return false;
		let depModified = false;

		for (const dep of Object.keys(depObj)) {
			const version = depObj[dep];
			if (version === "workspace:*" || version.startsWith("workspace:")) {
				const packageName = dep.split("/").pop();
				if (packageNames.includes(dep)) {
					depObj[dep] = `file:${relativePath}/${packageName}`;
					depModified = true;
				}
			}
		}

		return depModified;
	};

	// Update both dependencies and devDependencies
	modified = updateDeps(pkg.dependencies) || modified;
	modified = updateDeps(pkg.devDependencies) || modified;

	if (modified) {
		await writeFile(packageJsonPath, JSON.stringify(pkg, null, 2));
		console.log(`Updated ${packageJsonPath}`);
	}
}

/**
 * Copy a directory excluding certain patterns
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 */
async function copyDirectory(src, dest) {
	try {
		// Create the destination directory
		await mkdir(dest, { recursive: true });

		await cp(src, dest, {
			recursive: true,
			filter: (src) => !src.includes("node_modules") && !src.includes(".next"),
		});
	} catch (err) {
		console.error(`Error copying directory from ${src} to ${dest}:`, err);
		throw err;
	}
}

/**
 * Main function to prepare the Next.js app with dependencies
 */
async function prepareApp() {
	try {
		console.log("Starting preparation process");

		// remove output directory if it exists
		try {
			await stat(OUTPUT_DIR);
			await rm(OUTPUT_DIR, { recursive: true });
		} catch (err) {
			// directory not found, ok to proceed
			if (err.code !== "ENOENT") {
				console.error(`Error removing ${OUTPUT_DIR}:`, err);
			}
		}

		await mkdir(join(OUTPUT_DIR, "packages"), { recursive: true });

		// Copy Next.js app
		const nextAppSrcPath = join(process.cwd(), NEXT_APP_PATH);
		const nextAppDestPath = OUTPUT_DIR;

		console.log(`Copying Next.js app from ${nextAppSrcPath} to ${nextAppDestPath}`);
		await copyDirectory(nextAppSrcPath, nextAppDestPath);

		// Find all workspace dependencies
		const nextAppPackageJson = join(nextAppSrcPath, "package.json");
		const directDeps = await findWorkspaceDependencies(nextAppPackageJson);

		console.log("Direct workspace dependencies:", Object.keys(directDeps));

		// Collect all transitive dependencies
		const allDeps = { ...directDeps };
		for (const [_dep, depPath] of Object.entries(directDeps)) {
			const transitiveDeps = await collectAllDependencies(depPath);
			Object.assign(allDeps, transitiveDeps);
		}

		console.log("All workspace dependencies (including transitive):", Object.keys(allDeps));

		// Copy all dependencies
		for (const [dep, srcPath] of Object.entries(allDeps)) {
			const packageName = dep.split("/").pop() || dep;
			const destPath = join(OUTPUT_DIR, "packages", packageName);

			console.log(`Copying package ${dep} to ${destPath}`);
			await copyDirectory(srcPath, destPath);

			// Update package.json for each dependency
			const packageJsonPath = join(destPath, "package.json");
			await updatePackageJson(packageJsonPath, "../../packages", Object.keys(allDeps));
		}

		// Update Next.js app's package.json
		await updatePackageJson(join(nextAppDestPath, "package.json"), "./packages", Object.keys(allDeps));

		console.log("Preparation completed successfully");
		console.log(`Output directory: ${OUTPUT_DIR}`);
	} catch (err) {
		console.error("Preparation failed:", err);
		process.exit(1);
	}
}

// Run the preparation process
prepareApp();
