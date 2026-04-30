// scripts/build-exports.mjs
//
// Single source of truth for the public API:
//
//   - Reads exports.config.ts (the curated allowlist)
//   - Validates that every listed source file exists
//   - Writes the `exports` map into packages/fresco-ui/package.json
//
// With Rolldown's preserveModules, Vite discovers entries from the input glob
// in vite.config.ts — this script is no longer responsible for feeding Vite
// an entry list. Its only job is generating the published API surface.

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");

async function loadAllowlist() {
	const mod = await tsImport("../exports.config.ts", import.meta.url);
	return { exportEntries: mod.exportEntries, cssEntries: mod.cssEntries };
}

async function buildExportsMap() {
	const { exportEntries, cssEntries } = await loadAllowlist();
	const map = {};

	for (const e of exportEntries) {
		const abs = resolve(pkgRoot, "src", e.source);
		if (!existsSync(abs)) {
			throw new Error(`exports.config.ts: missing source ${e.source} (referenced by ${e.subpath})`);
		}
		const distBase = e.source.replace(/\.tsx?$/, "");
		map[e.subpath] = {
			types: `./dist/${distBase}.d.ts`,
			default: `./dist/${distBase}.js`,
		};
	}

	for (const e of cssEntries) {
		const abs = resolve(pkgRoot, "src", e.source);
		if (!existsSync(abs)) {
			throw new Error(`exports.config.ts: missing CSS source ${e.source} (referenced by ${e.subpath})`);
		}
		map[e.subpath] = `./dist/${e.source}`;
	}

	return map;
}

async function writePackageJson() {
	const pkgPath = resolve(pkgRoot, "package.json");
	const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
	pkg.exports = await buildExportsMap();
	// Tab indentation matches the repo's biome formatter config.
	await writeFile(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`);
	process.stdout.write(`wrote ${Object.keys(pkg.exports).length} export entries to package.json\n`);
}

await writePackageJson();
