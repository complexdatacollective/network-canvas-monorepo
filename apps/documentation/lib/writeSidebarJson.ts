import "dotenv/config"; // This is essential here, because helper functions (below) use env variables, but they are not available in the Node.js environment without dotenv! This file is run directly in Node via tsc.
import matter from "gray-matter";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { locales, type Locale, type SidebarLocaleDefinition, type TSideBar } from "~/app/types";
import {
	createFolderEntry,
	createPageEntry,
	createProjectEntry,
	getMetaDataForDirectory,
	getNestedPath,
	relativePathToDocs,
	set,
	sortDirectoryListing,
} from "./helper_functions";

/**
 * Generate sidebar data based on docs and locales.
 */
function generateSidebarData() {
	const files = readdirSync(relativePathToDocs, {
		withFileTypes: true, // returns fs.Dirent objects
		recursive: true, // recursively read all files in subdirectories
	}).filter((file) => file.isDirectory() || file.name.endsWith(".mdx") || file.name.endsWith(".md"));

	// Set up initial structure for sidebar data.
	const sidebarData: TSideBar = locales.reduce((acc, locale) => {
		acc[locale] = {} as SidebarLocaleDefinition;
		return acc;
	}, {} as TSideBar);

	const sortedFiles = sortDirectoryListing(files);

	for (const file of sortedFiles) {
		if (file.isDirectory()) {
			const metadata = getMetaDataForDirectory(join(file.path, file.name));
			const currentLocales = Object.keys(sidebarData);

			if (metadata.type === "project") {
				for (const l of currentLocales) {
					const locale = l as Locale;

					sidebarData[locale] = {
						...sidebarData[locale],
						[file.name]: createProjectEntry(file, locale, metadata),
					};
				}

				continue;
			}

			// If this is a folder, create a folder entry
			if (metadata.type === "folder") {
				const nestedPath = getNestedPath(file.path);

				// Insert folder entry for each locale in the nested path
				for (const l of currentLocales) {
					const locale = l as Locale;
					set(sidebarData[locale], [...nestedPath, file.name], createFolderEntry(file, locale, metadata));
				}

				continue;
			}
		}

		// Only process files ending in .md or .mdx
		if (!file.name.endsWith(".md") && !file.name.endsWith(".mdx")) {
			continue;
		}

		// Determine locale based on file name (format is `index.en.mdx` or `index.en.md`)
		const locale = file.name.split(".")[1] as Locale | undefined;

		// If there's no locale, or the locale isn't included in the type, ignore it.
		if (!locale || !locales.includes(locale as Locale)) {
			// eslint-disable-next-line no-console
			console.warn(
				`File ${file.name} is missing a locale or has a locale not defined in Locale. Locale is ${locale}. Skipping.`,
			);
			continue;
		}

		// Create a key based on the filename without the locale or extension
		// biome-ignore lint/style/noNonNullAssertion: structure is known
		const key = file.name.split(".")[0]!;

		const nestedPath = getNestedPath(file.path);

		const markdownFile = readFileSync(join(file.path, file.name), "utf-8");
		const matterResult = matter(markdownFile);

		// If file has "hidden: true" in frontmatter, skip it
		if (matterResult.data.hidden) {
			continue;
		}

		set(sidebarData[locale], [...nestedPath, key], createPageEntry(file, matterResult));
	}

	return sidebarData;
}

try {
	const sidebarData = generateSidebarData();

	writeFileSync(join(process.cwd(), "public", "sidebar.json"), JSON.stringify(sidebarData, null, "\t"), "utf-8");
} catch (e) {
	// eslint-disable-next-line no-console
	console.log("Error writing sidebar data!", e);
	throw e;
}
