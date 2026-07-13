import { z } from 'zod';

export const sections = [
  'get-started',
  'design-protocols',
  'collect-data',
  'analyze-data',
] as const;

export type Section = (typeof sections)[number];

export function hasDocumentationSection(pathname: string): boolean {
  const section = pathname.split('/')[2];
  return sections.some((candidate) => candidate === section);
}

export const locales = ['en'] as const;

const zlocales = z.enum(locales);

export type Locale = (typeof locales)[number];

const _itemTypes = [
  'section', // Top level workflow sections
  'folder', // Anything that has children
  'page', // Single page
] as const;

const SidebarItemBase = z.object({
  sourceFile: z.string().optional(),
  label: z.string(),
});

const SidebarPageSchema = SidebarItemBase.extend({
  type: z.literal('page'),
  sourceFile: z.string(),
  navOrder: z.number().nullable(),
  hidden: z.boolean().optional(),
});

export type SidebarPage = z.infer<typeof SidebarPageSchema>;

// Sidebar folder is potentially recursive in that it can contain other folders
// See: https://github.com/colinhacks/zod#recursive-types
//
// Because of that, we have to do some other shenanigans.

const baseSidebarFolder = SidebarItemBase.extend({
  type: z.literal('folder'),
  navOrder: z.number().nullable(),
  expanded: z.boolean().optional(),
});

type TSidebarFolder = z.infer<typeof baseSidebarFolder> & {
  children: Record<string, TSidebarFolder | SidebarPage>;
};

const SidebarFolderSchema: z.ZodType<TSidebarFolder> = baseSidebarFolder.extend(
  {
    children: z.lazy(() =>
      z.record(z.string(), z.union([SidebarFolderSchema, SidebarPageSchema])),
    ),
  },
);

export type SidebarFolder = z.infer<typeof SidebarFolderSchema>;

const SidebarSectionSchema = SidebarItemBase.extend({
  type: z.literal('section'),
  children: z.record(
    z.string(),
    z.union([SidebarFolderSchema, SidebarPageSchema]),
  ),
});

export type SidebarSection = z.infer<typeof SidebarSectionSchema>;

const SidebarLocaleDefinitionSchema = z.record(
  z.enum(sections),
  SidebarSectionSchema,
);

export type SidebarLocaleDefinition = Record<Section, SidebarSection>;

const _SideBarSchema = z.record(zlocales, SidebarLocaleDefinitionSchema);

// Can't infer this from above because of this: https://github.com/colinhacks/zod/issues/2623
export type TSideBar = Record<Locale, SidebarLocaleDefinition>;

const metadatatypes = ['folder', 'section'] as const;

export const MetadataFileSchema = z.object({
  type: z.enum(metadatatypes),
  slug: z.string().optional(),
  sourceFile: z.string().optional(),
  localeLabels: z.record(z.string(), z.string()).optional(),
  localeIndexFiles: z.record(z.string(), z.string()).optional(),
  isExpanded: z.boolean().optional(),
  navOrder: z.number().optional(),
});

export type MetadataFile = z.infer<typeof MetadataFileSchema>;

export type Messages = typeof import('../messages/en.json');
