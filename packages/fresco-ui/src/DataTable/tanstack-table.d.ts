import type { RowData } from '@tanstack/react-table';

import type { FilterConfig } from './filters/types';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    filterType?: 'range' | 'date' | 'text' | 'boolean' | 'faceted' | 'operator';
    filterConfig?: FilterConfig;
    className?: string;
  }
}
