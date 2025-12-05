import { existsSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { Button, Details, Heading, ListItem, OrderedList, Paragraph, Summary, UnorderedList } from "@codaco/ui";
import rehypeFigure from "@microflash/rehype-figure";
import type { ComponentProps, ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import type { Options } from "rehype-react";
import rehypeReact from "rehype-react";
import slug from "rehype-slug";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { z } from "zod";
import type { SidebarFolder, SidebarPage, SidebarProject, TSideBar } from "~/app/types";
import { BadPractice, GoodPractice } from "~/components/customComponents/BestPractices";
import ImageFullWidth from "~/components/customComponents/ImageFullWidth";
import { InterfaceMeta, InterfaceSummary } from "~/components/customComponents/InterfaceSummary";
import KeyConcept from "~/components/customComponents/KeyConcept";
import Pre from "~/components/customComponents/Pre";
import { PrerequisitesSection, SummaryCard, SummarySection } from "~/components/customComponents/SummaryCard";
import TipBox, { type TipBoxProps } from "~/components/customComponents/TipBox";
import VideoIFrame from "~/components/customComponents/VideoIFrame";
import Link from "~/components/Link";
import { get } from "./helper_functions";
import processPreTags from "./processPreTags";
import processYamlMatter from "./processYamlMatter";
import { type HeadingNode, headingTree } from "./tableOfContents";
import { cn } from "./utils";

const getSidebar = (): Partial<TSideBar> => {
	const sidebarPath = join(process.cwd(), "public", "sidebar.json");
	if (!existsSync(sidebarPath)) {
		return {};
	}
	const sidebarContent = readFileSync(sidebarPath, "utf-8");
	return JSON.parse(sidebarContent) as TSideBar;
};

const FrontmatterSchema = z.object({
	title: z.string(),
	lastUpdated: z.string().optional(),
	hidden: z.boolean().optional(),
	wip: z.boolean().optional(),
	navOrder: z.number().optional(),
	toc: z.boolean().optional().default(true),
	// interfaces
	good: z.array(z.string()).optional(), // List of best practices
	bad: z.array(z.string()).optional(), // List of bad practices
});

// Process docPaths to remove CWD, docs subdirectory, file extensions, and split into segments
const processPath = (docPath: string) => {
	const processedPath = docPath
		.split(sep)
		.slice(3) // First element is empty string, second is 'docs', third is the project name
		// Process the last item to remove the locale and file extension
		.map((segment, index, array) => {
			if (index === array.length - 1) {
				// biome-ignore lint/style/noNonNullAssertion: we know that the last element is a string
				return segment.split(".")[0]!;
			}
			return segment;
		});

	return processedPath;
};

// Given locale and project, generate all the possible docPaths.
// Return something in the format of:
// {
//   locale: 'ru',
//   project: 'fresco',
//   docPath: [ 'getting-started', 'installation' ]
// }
type ReturnType = {
	locale: string;
	project: string;
	docPath: string[];
};

export const getDocsForRouteSegment = ({ locale, project }: { locale: string; project: string }) => {
	const sidebar = getSidebar();
	const sidebarData = get(sidebar, [locale, project], null) as SidebarProject;

	if (!sidebarData) {
		// biome-ignore lint/suspicious/noConsole: Logging missing sidebar data
		console.log(`No sidebar data found for ${locale} and ${project}`);
		return [];
	}

	const results: ReturnType[] = [];

	const getSourceFilePaths = (data: SidebarProject | SidebarFolder | SidebarPage) => {
		// Leaf node
		if (data.type === "page") {
			results.push({
				locale,
				project,
				docPath: processPath(data.sourceFile),
			});
			return;
		}

		if (data.sourceFile && data.type !== "project") {
			// Handle folders differently - if they have a sourceFile
			// docPath should generate a path pointing to the folder.
			results.push({
				locale,
				project,
				docPath: processPath(data.sourceFile).slice(0, -1),
			});
		}

		for (const key in data.children) {
			if (Object.hasOwn(data.children, key)) {
				const child = data.children[key];
				if (child) {
					getSourceFilePaths(child);
				}
			}
		}

		return;
	};

	getSourceFilePaths(sidebarData);

	return results;
};

// Get the sourceFile path from the sidebar.json
const getSourceFile = (locale: string, project: string, pathSegment?: string[]) => {
	const sidebar = getSidebar();
	const projectSourceFile = get(sidebar, [locale, project, "sourceFile"], null) as string;

	if (!pathSegment) return join(process.cwd(), projectSourceFile);

	const pathSegmentWithChildren = pathSegment.flatMap((segment, index) => {
		if (index === 0) {
			return segment;
		}

		return ["children", segment];
	});

	const folderSourceFile = get(
		sidebar,
		[locale, project, "children", ...pathSegmentWithChildren, "sourceFile"],
		null,
	) as string | null;

	if (!folderSourceFile) return null;

	return join(process.cwd(), folderSourceFile);
};

const markdownComponents = {
	h1: (props: ComponentProps<typeof Heading>) => <Heading variant="h1" {...props} />,
	h2: (props: ComponentProps<typeof Heading>) => <Heading variant="h2" {...props} />,
	h3: (props: ComponentProps<typeof Heading>) => <Heading variant="h3" {...props} />,
	h4: (props: ComponentProps<typeof Heading>) => <Heading variant="h4" {...props} />,
	p: Paragraph,
	paragraph: Paragraph,
	a: Link,
	ul: UnorderedList,
	ol: OrderedList,
	li: ListItem,
	blockquote: (props: { children: ReactNode }) => (
		<blockquote className="my-4 border-s-4 border-accent bg-card p-4">{props.children}</blockquote>
	),
	pre: Pre,
	button: (props: ComponentProps<typeof Button>) => <Button variant="default" {...props} />,
	link: (
		props: ComponentProps<typeof Link> & {
			className?: string;
			children: ReactNode;
		},
	) => {
		return <Link {...props} />;
	},
	tipbox: (props: TipBoxProps) => {
		return <TipBox danger={props.danger !== undefined}>{props.children}</TipBox>;
	},
	imagefullwidth: (props: { src: string; alt: string }) => <ImageFullWidth {...props} />,
	figure: (props: { children: ReactNode }) => (
		<figure
			{...props}
			className={cn(
				"my-10 flex w-full flex-col items-center justify-center",
				"[--shadow-color:color-mix(in_lab,hsl(var(--background))_80%,black)]",
				"[&>a]:m-0 [&>a]:w-full [&>a]:drop-shadow-[0_0.5rem_1rem_var(--shadow-color)]",
			)}
		/>
	),
	figcaption: (props: { children: ReactNode }) => <figcaption {...props} className="mt-2 text-center text-sm italic" />,
	img: (props: { src?: string; alt?: string }) => (
		<a href={props.src} target="_blank" rel="noreferrer" className="my-10 w-full px-8">
			{/* biome-ignore lint/performance/noImgElement: markdown content with unknown dimensions */}
			<img {...props} alt={props.alt} className="w-full" />
		</a>
	),
	keyconcept: (props: { title: string; children: ReactNode }) => <KeyConcept {...props} />,
	goodpractice: (props: { children: ReactNode }) => <GoodPractice {...props} />,
	badpractice: (props: { children: ReactNode }) => <BadPractice {...props} />,
	videoiframe: (props: { src: string; title: string }) => <VideoIFrame {...props} />,
	summarycard: (props: { duration: string; children: ReactNode }) => <SummaryCard {...props} />,
	prerequisitessection: (props: { children: ReactNode }) => <PrerequisitesSection {...props} />,
	summarysection: (props: { children: ReactNode }) => <SummarySection {...props} />,
	interfacesummary: (props: { children: ReactNode }) => <InterfaceSummary {...props} />,
	interfacemeta: (props: { type: string; creates: string; usesprompts: string }) => <InterfaceMeta {...props} />,
	definition: (props: { children: ReactNode }) => <div className="text-lg font-normal">{props.children}</div>,
	table: (props: { children: ReactNode }) => (
		<div className="overflow-x-auto">
			<table
				className="prose dark:prose-th:text-foreground dark:prose-strong:text-foreground dark:prose-td:text-foreground my-5 w-full !max-w-max text-pretty break-keep [&>th]:text-nowrap"
				{...props}
			/>
		</div>
	),
	details: Details,
	summary: Summary,
};

export async function getDocumentForPath({
	locale,
	project,
	pathSegment,
}: {
	locale: string;
	project: string;
	pathSegment?: string[];
}) {
	const sourceFile = getSourceFile(locale, project, pathSegment);

	if (!sourceFile || (sourceFile && !existsSync(sourceFile))) {
		return null;
	}

	const markdownFile = readFileSync(sourceFile, "utf-8");

	const result = await unified()
		.use(remarkParse, { fragment: true })
		.use(remarkGfm)
		.use(remarkFrontmatter)
		.use(processYamlMatter)
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(rehypeFigure)
		.use(rehypeRaw)
		.use(slug)
		.use(headingTree)
		.use(processPreTags)
		.use(rehypeHighlight, { detect: true })
		.use(rehypeReact, {
			Fragment,
			jsx,
			jsxs,
			components: markdownComponents,
		} as Options)
		.process(markdownFile);

	const validatedFrontmatter = FrontmatterSchema.parse(result.data.matter);

	return {
		frontmatter: validatedFrontmatter,
		headings: result.data.headings as HeadingNode[],
		component: result.result,
	};
}
