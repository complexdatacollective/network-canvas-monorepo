import type { RowData } from '@tanstack/react-table';

import type { FilterConfig } from './filters/types';

/**
 * This file is only part of a TypeScript program when a tsconfig's `include`
 * glob picks it up, which happens for fresco-ui's own build but not for
 * consumers that typecheck an individual source file (e.g. `ColumnHeader.tsx`)
 * directly under their own tsconfig. `./types.ts` — the module every
 * column-meta consumer (`ColumnHeader.tsx`, `filters/types.ts`) already
 * imports, directly or transitively — pulls this file into the program with
 * a type-only side-effect import (a value-level `import`/`/// <reference>`
 * would either break Vite's runtime resolution of this declaration-only file
 * or trip the project's triple-slash-reference lint rule).
 */
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    filterType?: 'range' | 'date' | 'text' | 'boolean' | 'faceted' | 'operator';
    filterConfig?: FilterConfig;
    className?: string;
  }
}
