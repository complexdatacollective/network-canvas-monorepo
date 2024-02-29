import { z } from 'zod';

export const locales = ['en', 'ru'] as const;

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

export const SidebarPage = SidebarItemBase.extend({
  type: z.literal('page'),
  sourceFile: z.string(),
});

export type SidebarPage = z.infer<typeof SidebarPage>;

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

export const SidebarFolder: z.ZodType<TSidebarFolder> =
  baseSidebarFolder.extend({
    children: z.lazy(() => z.record(z.union([SidebarFolder, SidebarPage]))),
  });

export type SidebarFolder = z.infer<typeof SidebarFolder>;

export const SidebarProject = SidebarItemBase.extend({
  type: z.literal('project'),
  children: z.record(z.union([SidebarFolder, SidebarPage])),
});

export type SidebarProject = z.infer<typeof SidebarProject>;

export const SidebarLocaleDefinition = z.record(z.string(), SidebarProject);

export type SidebarLocaleDefinition = z.infer<typeof SidebarLocaleDefinition>;

export const SideBar = z.record(LocalesEnum, SidebarLocaleDefinition);

export type TSideBar = z.infer<typeof SideBar>;

const metadatatypes = ['folder', 'project'] as const;

export const MetadataFile = z.object({
  type: z.enum(metadatatypes),
  sourceFile: z.string().optional(),
  localeLabels: z.record(LocalesEnum, z.string()).optional(),
  localeIndexFiles: z.record(LocalesEnum, z.string()).optional(),
  isExpanded: z.boolean().optional(),
});

export type MetadataFile = z.infer<typeof MetadataFile>;

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
export type Messages = typeof import('../messages/en.json');
