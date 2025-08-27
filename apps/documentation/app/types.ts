import { z } from "zod";

export const projects = ["desktop", "fresco"] as const;

export type Project = (typeof projects)[number];

export const locales = ["en"] as const;

export const zlocales = z.enum(locales);

export type Locales = typeof locales;

export type Locale = (typeof locales)[number];

export const itemTypes = [
	"project", // Top level projects
	"folder", // Anything that has children
	"page", // Single page
] as const;

export const SidebarItemBase = z.object({
	sourceFile: z.string().optional(),
	label: z.string(),
});

export const SidebarPageSchema = SidebarItemBase.extend({
	type: z.literal("page"),
	sourceFile: z.string(),
	navOrder: z.number().nullable(),
});

export type SidebarPage = z.infer<typeof SidebarPageSchema>;

// Sidebar folder is potentially recursive in that it can contain other folders
// See: https://github.com/colinhacks/zod#recursive-types
//
// Because of that, we have to do some other shenanigans.

export const baseSidebarFolder = SidebarItemBase.extend({
	type: z.literal("folder"),
	navOrder: z.number().nullable(),
	expanded: z.boolean().optional(),
});

export type TSidebarFolder = z.infer<typeof baseSidebarFolder> & {
	children: Record<string, TSidebarFolder | SidebarPage>;
};

export const SidebarFolderSchema: z.ZodType<TSidebarFolder> = baseSidebarFolder.extend({
	children: z.lazy(() => z.record(z.string(), z.union([SidebarFolderSchema, SidebarPageSchema]))),
});

export type SidebarFolder = z.infer<typeof SidebarFolderSchema>;

export const SidebarProjectSchema = SidebarItemBase.extend({
	type: z.literal("project"),
	children: z.record(z.string(), z.union([SidebarFolderSchema, SidebarPageSchema])),
});

export type SidebarProject = z.infer<typeof SidebarProjectSchema>;

export const SidebarLocaleDefinitionSchema = z.record(z.enum(projects), SidebarProjectSchema);

export type SidebarLocaleDefinition = Record<Project, SidebarProject>;

export const SideBarSchema = z.record(zlocales, SidebarLocaleDefinitionSchema);

// Can't infer this from above because of this: https://github.com/colinhacks/zod/issues/2623
export type TSideBar = Record<Locale, SidebarLocaleDefinition>;

const metadatatypes = ["folder", "project"] as const;

export const MetadataFileSchema = z.object({
	type: z.enum(metadatatypes),
	sourceFile: z.string().optional(),
	localeLabels: z.record(z.string(), z.string()).optional(),
	localeIndexFiles: z.record(z.string(), z.string()).optional(),
	isExpanded: z.boolean().optional(),
	navOrder: z.number().optional(),
});

export type MetadataFile = z.infer<typeof MetadataFileSchema>;

export type Messages = typeof import("../messages/en.json");
