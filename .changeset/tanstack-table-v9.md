---
'@codaco/fresco-ui': major
---

The `DataTable` components now run on TanStack Table v9. The `@tanstack/react-table` peer dependency moves from `^8.21.3` to `^9.2.4`.

**Breaking:** tables rendered through `DataTable`, `DataTableColumnHeader`, `DataTablePagination`, `DataTableToolbar`, `DataTableFacetedFilter`, `DataTableFloatingBar` and `SelectAllHeader` must now be built with the shared feature set from the new `@codaco/fresco-ui/DataTable/features` subpath:

```tsx
import { useTable } from '@tanstack/react-table';
import { dataTableFeatures } from '@codaco/fresco-ui/DataTable/features';

const table = useTable({ features: dataTableFeatures, data, columns });
```

v9 installs only the APIs of registered features, and its table type is tied to its feature set, so the components take a `Table<DataTableFeatures, TData>`. `dataTableFeatures` registers sorting, column and global filtering, pagination, row selection and column visibility with their client-side row models. A table that does not paginate, sort or filter in the browser — because its rows arrive already processed, or because it shows every row — sets `manualPagination`, `manualSorting` or `manualFiltering`, which skips that row model as leaving it out did in v8.

Other changes for consumers:

- `StrictColumnDef` now requires `sortFn` (v9's name for `sortingFn`) on every sortable column, and the new `DataTableColumnDef<TData>` names a column definition for these tables.
- Column `meta` (`filterType`, `filterConfig`, `className`) is typed per table through `dataTableFeatures` instead of a global `ColumnMeta` declaration merge, and the exported `DataTableColumnMeta` type describes it. Remove any `declare module '@tanstack/react-table'` augmentation that copied it.
- The custom filter functions in `DataTable/filters/filterFns` take a v9 `Row<TFeatures, TData>`.
- Built-in filters and sorts named by string resolve against the registered set: `includesString`, `inNumberRange`, `inDateRange`, `equals`, `weakEquals`, `arrIncludes` and `arrIncludesSome` for filters; `alphanumeric`, `basic`, `datetime`, `text` and `textCaseSensitive` for sorts.
