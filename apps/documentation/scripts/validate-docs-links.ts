#!/usr/bin/env tsx
/** biome-ignore-all lint/suspicious/noConsole: build-time validator */
/**
 * Static link validation for documentation markdown.
 *
 * Walks every .md / .mdx file under docs/ and verifies that internal links
 * (absolute paths starting with /) resolve to a real target:
 *   - File-extension links (e.g. /protocols/foo.netcanvas, /images/x.png) must
 *     point to an existing file in public/.
 *   - Page links (e.g. /en/desktop/tutorials/using-interviewer) must point to
 *     a markdown source file in docs/<project>/<rest>.<locale>.{md,mdx} or to
 *     a project/folder index.
 *
 * The runtime dead-link checker validates HTTP status against a live preview
 * deploy. It cannot catch two classes of problem this script handles:
 *   1. Page links typo'd to a path that has no corresponding source file —
 *      they still hit the catch-all 301 in netlify.toml and resolve "OK".
 *   2. File downloads (.netcanvas, .pdf, ...) that exist on disk but get
 *      intercepted by next/link client-side routing on click. Catching the
 *      misrouted-click case requires that file links be rendered as plain
 *      <a> elements (see components/Link.tsx); this script also lists every
 *      file-target link so a reviewer can spot drift.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DOCS_ROOT = resolve(__dirname, "..", "docs");
const PUBLIC_ROOT = resolve(__dirname, "..", "public");

const LOCALES = ["en", "ru"] as const;

type Finding = {
	sourceFile: string;
	line: number;
	link: string;
	reason: string;
};

const findings: Finding[] = [];

const walk = (dir: string): string[] => {
	const entries = readdirSync(dir, { withFileTypes: true });
	const out: string[] = [];
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...walk(full));
		} else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".mdx"))) {
			out.push(full);
		}
	}
	return out;
};

// Matches `[text](href)` and `[text](<href with spaces>)`. The href group
// is non-greedy and stops at the first unescaped `)` (or `>` for the angle
// form), which matches CommonMark's link destination rules closely enough
// for our purposes.
const LINK_RE = /\[(?:[^\]\\]|\\.)*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;

const stripFragment = (href: string) => href.split("#")[0]?.split("?")[0] ?? "";

const isExternal = (href: string) =>
	/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href) || href.startsWith("mailto:") || href.startsWith("tel:");

const decodePath = (href: string) => {
	try {
		return decodeURIComponent(href);
	} catch {
		return href;
	}
};

const fileExists = (path: string) => existsSync(path) && statSync(path).isFile();

// Locate a docs source file for a page-style link like
// /en/desktop/tutorials/using-interviewer. The locale is the first segment;
// the second is the project (matching a docs/<project>/ directory).
const resolvePageLink = (link: string): boolean => {
	const segments = link.split("/").filter(Boolean);
	if (segments.length < 2) return false;
	const [locale, project, ...rest] = segments;
	if (!locale || !project) return false;
	if (!(LOCALES as readonly string[]).includes(locale)) return false;

	const projectDir = join(DOCS_ROOT, project);
	if (!existsSync(projectDir)) return false;

	// Project root link: /<locale>/<project>
	if (rest.length === 0) return true;

	const joined = rest.join("/");
	const candidates = [
		join(projectDir, `${joined}.${locale}.mdx`),
		join(projectDir, `${joined}.${locale}.md`),
		// Folder index (metadata.json points at an index file inside the folder).
		join(projectDir, joined),
	];
	for (const candidate of candidates) {
		if (!existsSync(candidate)) continue;
		const stat = statSync(candidate);
		if (stat.isFile()) return true;
		if (stat.isDirectory()) {
			// Accept folders that contain a localized index file.
			const entries = readdirSync(candidate);
			if (entries.some((f) => f.endsWith(`.${locale}.mdx`) || f.endsWith(`.${locale}.md`))) {
				return true;
			}
		}
	}
	return false;
};

const resolveFileLink = (link: string): boolean => {
	const decoded = decodePath(link);
	const onDisk = join(PUBLIC_ROOT, decoded.replace(/^\//, ""));
	return fileExists(onDisk);
};

const lineNumberFor = (content: string, index: number) => {
	let line = 1;
	for (let i = 0; i < index && i < content.length; i += 1) {
		if (content[i] === "\n") line += 1;
	}
	return line;
};

const checkFile = (file: string) => {
	const content = readFileSync(file, "utf-8");
	LINK_RE.lastIndex = 0;
	for (let match = LINK_RE.exec(content); match !== null; match = LINK_RE.exec(content)) {
		const raw = (match[1] ?? match[2] ?? "").trim();
		if (!raw) continue;
		if (raw.startsWith("#")) continue;
		if (isExternal(raw)) continue;
		if (!raw.startsWith("/")) continue; // skip relative links — out of scope for this pass

		const href = stripFragment(raw);
		if (!href) continue;

		const hasExtension = extname(decodePath(href)) !== "";
		const ok = hasExtension ? resolveFileLink(href) : resolvePageLink(href);
		if (!ok) {
			findings.push({
				sourceFile: relative(process.cwd(), file),
				line: lineNumberFor(content, match.index),
				link: raw,
				reason: hasExtension
					? `no file at public${posix.normalize(decodePath(href))}`
					: `no docs source for page ${href}`,
			});
		}
	}
};

const main = () => {
	const files = walk(DOCS_ROOT);
	for (const file of files) checkFile(file);

	if (findings.length === 0) {
		console.log(`✅ Validated internal links in ${files.length} markdown files; all targets resolve.`);
		process.exit(0);
	}

	console.error(`❌ Found ${findings.length} broken internal link(s):\n`);
	for (const f of findings) {
		console.error(`  ${f.sourceFile}:${f.line}`);
		console.error(`    link:   ${f.link}`);
		console.error(`    reason: ${f.reason}\n`);
	}
	process.exit(1);
};

main();
