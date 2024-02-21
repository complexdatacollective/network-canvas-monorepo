export interface Folder {
  type: 'folder';
  name: string;
  language: string;
  source: string;
  folderPagePath: string | null;
  isExpanded: boolean;
  files: Array<DocFile | Folder>;
}

export interface DocFile {
  type: 'file';
  name: string;
  language: string;
  path: string;
  source: string;
}

type LanguageData = {
  [key: string]: Folder[];
};

export type SidebarData = LanguageData[];

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
export type Messages = typeof import('./messages/en.json');
