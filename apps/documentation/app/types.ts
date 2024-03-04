import { z } from 'zod';

export const projects = ['desktop', 'fresco'] as const;

export type ProjectsEnum = (typeof projects)[number];

export const locales = ['en'] as const;

const LocalesEnum = z.enum(locales);

export type LocalesEnum = (typeof locales)[number];

export const itemTypes = [
  'project', // Top level projects
  'folder', // Anything that has children
  'page', // Single page
] as const;

const ItemTypesEnum = z.enum(itemTypes);

export const SidebarItemBase = z.object({
  type: ItemTypesEnum,
  sourceFile: z.string().optional(),
  label: z.string(),
});

export const SidebarPageSchema = SidebarItemBase.extend({
  type: z.literal('page'),
  sourceFile: z.string(),
});

export type SidebarPage = z.infer<typeof SidebarPageSchema>;

// Sidebar folder is potentially recursive in that it can contain other folders
// See: https://github.com/colinhacks/zod#recursive-types
//
// Because of that, we have to do some other shenanigans.

export const baseSidebarFolder = SidebarItemBase.extend({
  type: z.literal('folder'),
  expanded: z.boolean().optional(),
});

export type TSidebarFolder = z.infer<typeof baseSidebarFolder> & {
  children: Record<string, TSidebarFolder | SidebarPage>;
};

export const SidebarFolderSchema: z.ZodType<TSidebarFolder> =
  baseSidebarFolder.extend({
    children: z.lazy(() =>
      z.record(z.union([SidebarFolderSchema, SidebarPageSchema])),
    ),
  });

export type SidebarFolder = z.infer<typeof SidebarFolderSchema>;

export const SidebarProjectSchema = SidebarItemBase.extend({
  type: z.literal('project'),
  children: z.record(z.union([SidebarFolderSchema, SidebarPageSchema])),
});

export type SidebarProject = z.infer<typeof SidebarProjectSchema>;

export const SidebarLocaleDefinitionSchema = z.record(
  z.string(),
  SidebarProjectSchema,
);

export type SidebarLocaleDefinition = z.infer<
  typeof SidebarLocaleDefinitionSchema
>;

export const SideBarSchema = z.record(
  LocalesEnum,
  SidebarLocaleDefinitionSchema,
);

export type TSideBar = z.infer<typeof SideBarSchema>;

const metadatatypes = ['folder', 'project'] as const;

export const MetadataFileSchema = z.object({
  type: z.enum(metadatatypes),
  sourceFile: z.string().optional(),
  localeLabels: z.record(LocalesEnum, z.string()).optional(),
  localeIndexFiles: z.record(LocalesEnum, z.string()).optional(),
  isExpanded: z.boolean().optional(),
});

export type MetadataFile = z.infer<typeof MetadataFileSchema>;

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
export type Messages = typeof import('../messages/en.json');
