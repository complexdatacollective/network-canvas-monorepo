import { z } from 'zod';

export const locales = ['en', 'ru'] as const;

const LocalesEnum = z.enum(locales);

export const projects = ['Desktop', 'Fresco'] as const;

const ProjectsEnum = z.enum(projects);

export const itemTypes = [
  'project', // Top level projects
  'folder', // Anything that has children
  'page', // Single page
] as const;

const ItemTypesEnum = z.enum(itemTypes);

export const SidebarItemBase = z.object({
  type: ItemTypesEnum,
  sourceFile: z.string().optional(),
  slug: z.string(),
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

export const SidebarProject = SidebarItemBase.extend({
  type: z.literal('project'),
  children: z.record(z.union([SidebarFolder, SidebarPage])),
});

export const SidebarLocaleDefinition = z.record(ProjectsEnum, SidebarProject);

export const SideBar = z.record(LocalesEnum, SidebarLocaleDefinition);

export type TSideBar = z.infer<typeof SideBar>;

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
export type Messages = typeof import('../messages/en.json');
