#!/usr/bin/env tsx
/**
 * Validates redirect configurations in netlify.toml and vercel.json
 * Catches common issues before deployment:
 * - Invalid syntax differences between Netlify and Vercel
 * - Conflicting redirect rules
 * - Catch-all rules that should be at the end
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface NetlifyRedirect {
	from: string;
	to: string;
	status: number;
	force?: boolean;
}

interface VercelRedirect {
	source: string;
	destination: string;
	permanent: boolean;
}

interface ValidationIssue {
	severity: "error" | "warning";
	file: string;
	rule: string;
	message: string;
}

const issues: ValidationIssue[] = [];

function parseNetlifyToml(content: string): NetlifyRedirect[] {
	const redirects: NetlifyRedirect[] = [];
	const lines = content.split("\n");
	let currentRedirect: Partial<NetlifyRedirect> = {};

	for (const line of lines) {
		const trimmed = line.trim();

		if (trimmed === "[[redirects]]") {
			if (currentRedirect.from && currentRedirect.to) {
				redirects.push(currentRedirect as NetlifyRedirect);
			}
			currentRedirect = {};
		} else if (trimmed.startsWith("from = ")) {
			currentRedirect.from = trimmed.match(/from = "(.+)"/)?.[1] || "";
		} else if (trimmed.startsWith("to = ")) {
			currentRedirect.to = trimmed.match(/to = "(.+)"/)?.[1] || "";
		} else if (trimmed.startsWith("status = ")) {
			currentRedirect.status = Number.parseInt(trimmed.match(/status = (\d+)/)?.[1] || "301");
		} else if (trimmed.startsWith("force = ")) {
			currentRedirect.force = trimmed.includes("true");
		}
	}

	// Add last redirect if exists
	if (currentRedirect.from && currentRedirect.to) {
		redirects.push(currentRedirect as NetlifyRedirect);
	}

	return redirects;
}

function validateNetlifyRedirects(redirects: NetlifyRedirect[]): void {
	let foundCatchAll = false;
	let catchAllIndex = -1;

	for (let i = 0; i < redirects.length; i++) {
		const redirect = redirects[i];
		if (!redirect) continue;

		// Check for invalid path parameter syntax (should use splat)
		if (redirect.from.includes("/:path") && !redirect.to.includes(":path")) {
			issues.push({
				severity: "error",
				file: "netlify.toml",
				rule: `${redirect.from} => ${redirect.to}`,
				message:
					"Invalid syntax: Netlify requires /* and :splat for wildcard paths, not /:path. Use 'from = \"/*\"' and 'to = \"/prefix/:splat\"'",
			});
		}

		// Check if using :path without matching :splat in destination
		if (redirect.from.includes("/:path") && redirect.to.includes("/:path")) {
			issues.push({
				severity: "warning",
				file: "netlify.toml",
				rule: `${redirect.from} => ${redirect.to}`,
				message:
					"Potential issue: Netlify uses :splat instead of :path for capturing multi-segment paths. Consider using /* and :splat",
			});
		}

		// Detect catch-all rules
		if (redirect.from === "/*" || redirect.from.match(/^\/:\w+\*?$/)) {
			if (foundCatchAll) {
				issues.push({
					severity: "warning",
					file: "netlify.toml",
					rule: `${redirect.from} => ${redirect.to}`,
					message: "Multiple catch-all rules found. Only the first one will match.",
				});
			}
			foundCatchAll = true;
			catchAllIndex = i;
		}

		// Check for rules after catch-all
		if (foundCatchAll && catchAllIndex >= 0 && i > catchAllIndex) {
			issues.push({
				severity: "error",
				file: "netlify.toml",
				rule: `${redirect.from} => ${redirect.to}`,
				message:
					"Rule will never match: specific rules must come BEFORE catch-all rules in Netlify (rules are processed top-to-bottom)",
			});
		}

		// Warn about force flag on catch-all
		if (foundCatchAll && redirect.force && i === catchAllIndex) {
			issues.push({
				severity: "warning",
				file: "netlify.toml",
				rule: `${redirect.from} => ${redirect.to}`,
				message: "force = true on catch-all rule may cause unexpected behavior",
			});
		}
	}

	// Check for duplicate from paths
	const fromPaths = redirects.map((r) => r.from);
	const duplicates = fromPaths.filter((path, index) => fromPaths.indexOf(path) !== index);
	if (duplicates.length > 0) {
		for (const dup of new Set(duplicates)) {
			issues.push({
				severity: "error",
				file: "netlify.toml",
				rule: dup,
				message: `Duplicate redirect rule: ${dup} appears multiple times`,
			});
		}
	}
}

function validateVercelRedirects(redirects: VercelRedirect[]): void {
	let foundCatchAll = false;
	let catchAllIndex = -1;

	for (let i = 0; i < redirects.length; i++) {
		const redirect = redirects[i];
		if (!redirect) continue;

		// Detect catch-all rules (Vercel style)
		if (redirect.source.match(/\/:\w+\*$/) || redirect.source.match(/\/:\w+\([^)]+\)\*$/)) {
			if (foundCatchAll) {
				issues.push({
					severity: "warning",
					file: "vercel.json",
					rule: `${redirect.source} => ${redirect.destination}`,
					message: "Multiple catch-all rules found. Order matters.",
				});
			}
			foundCatchAll = true;
			catchAllIndex = i;
		}

		// Check for rules after catch-all
		if (foundCatchAll && catchAllIndex >= 0 && i > catchAllIndex) {
			issues.push({
				severity: "warning",
				file: "vercel.json",
				rule: `${redirect.source} => ${redirect.destination}`,
				message: "Rule may not match as expected: consider placing specific rules before catch-all rules",
			});
		}
	}

	// Check for duplicate source paths
	const sourcePaths = redirects.map((r) => r.source);
	const duplicates = sourcePaths.filter((path, index) => sourcePaths.indexOf(path) !== index);
	if (duplicates.length > 0) {
		for (const dup of new Set(duplicates)) {
			issues.push({
				severity: "error",
				file: "vercel.json",
				rule: dup,
				message: `Duplicate redirect rule: ${dup} appears multiple times`,
			});
		}
	}
}

function validateConsistency(netlifyRedirects: NetlifyRedirect[], vercelRedirects: VercelRedirect[]): void {
	// Create maps of source -> destination for comparison
	const netlifyMap = new Map(
		netlifyRedirects.filter((r) => !r.from.includes("*") && !r.from.includes(":")).map((r) => [r.from, r.to]),
	);

	const vercelMap = new Map(
		vercelRedirects
			.filter((r) => !r.source.includes("*") && !r.source.includes(":"))
			.map((r) => [r.source, r.destination]),
	);

	// Check for rules in one but not the other
	for (const [from, to] of netlifyMap) {
		if (!vercelMap.has(from)) {
			issues.push({
				severity: "warning",
				file: "netlify.toml",
				rule: `${from} => ${to}`,
				message: "Rule exists in netlify.toml but not in vercel.json",
			});
		} else if (vercelMap.get(from) !== to) {
			issues.push({
				severity: "error",
				file: "both",
				rule: from,
				message: `Inconsistent destinations: netlify.toml => ${to}, vercel.json => ${vercelMap.get(from)}`,
			});
		}
	}

	for (const [source] of vercelMap) {
		if (!netlifyMap.has(source)) {
			issues.push({
				severity: "warning",
				file: "vercel.json",
				rule: `${source} => ${vercelMap.get(source)}`,
				message: "Rule exists in vercel.json but not in netlify.toml",
			});
		}
	}
}

function main() {
	const docsDir = join(__dirname, "..");

	try {
		// Read and parse netlify.toml
		const netlifyContent = readFileSync(join(docsDir, "netlify.toml"), "utf-8");
		const netlifyRedirects = parseNetlifyToml(netlifyContent);
		console.log(`✓ Found ${netlifyRedirects.length} redirects in netlify.toml`);

		// Read and parse vercel.json
		const vercelContent = readFileSync(join(docsDir, "vercel.json"), "utf-8");
		const vercelConfig = JSON.parse(vercelContent);
		const vercelRedirects: VercelRedirect[] = vercelConfig.redirects || [];
		console.log(`✓ Found ${vercelRedirects.length} redirects in vercel.json\n`);

		// Run validations
		validateNetlifyRedirects(netlifyRedirects);
		validateVercelRedirects(vercelRedirects);
		validateConsistency(netlifyRedirects, vercelRedirects);

		// Report issues
		if (issues.length === 0) {
			console.log("✅ All redirect configurations are valid!\n");
			process.exit(0);
		}

		const errors = issues.filter((i) => i.severity === "error");
		const warnings = issues.filter((i) => i.severity === "warning");

		if (errors.length > 0) {
			console.error("❌ Found errors in redirect configurations:\n");
			for (const error of errors) {
				console.error(`  [${error.file}] ${error.rule}`);
				console.error(`    ${error.message}\n`);
			}
		}

		if (warnings.length > 0) {
			console.warn("⚠️  Found warnings in redirect configurations:\n");
			for (const warning of warnings) {
				console.warn(`  [${warning.file}] ${warning.rule}`);
				console.warn(`    ${warning.message}\n`);
			}
		}

		console.log(`\nSummary: ${errors.length} error(s), ${warnings.length} warning(s)`);

		// Exit with error code if there are errors
		process.exit(errors.length > 0 ? 1 : 0);
	} catch (error) {
		console.error("❌ Failed to validate redirects:", error);
		process.exit(1);
	}
}

main();
