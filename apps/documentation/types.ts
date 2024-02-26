export type Folder = {
  type: 'folder';
  name: string;
  language: string;
  source: string;
  folderPagePath: string | null;
  isExpanded: boolean;
  files: (DocFile | Folder)[];
};

export type DocFile = {
  type: 'file';
  name: string;
  language: string;
  path: string;
  source: string;
};

type LanguageData = Record<string, Folder[]>;

export type SidebarData = LanguageData[];

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
export type Messages = typeof import('./messages/en.json');
