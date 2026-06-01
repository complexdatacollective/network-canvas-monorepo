---
'@codaco/fresco-ui': minor
---

New `DataTable` component family at `./DataTable` (`DataTable`, `ColumnHeader`, `DataTableFacetedFilter`, `DataTableFloatingBar`, `DataTablePagination`, `DataTableSkeleton`, `DataTableToolbar`, `SelectAllHeader`, plus filter helpers). Built on `@tanstack/react-table` with pagination, sorting, faceted filters, row selection, and a floating bulk-action bar. Ports the prior `interviewer-v7` DataView implementation up into the shared library.

`WizardDialog` accepts an optional `cancelLabel` prop.

`Dialog` accepts a `dismissible` prop (default `true`) controlling close-button rendering and outside-click/Esc dismissal. `Modal` no longer passes the prop through — gating happens locally inside `Dialog`.

`SegmentedCodeField` gains a `sensitive` prop (PIN-style masking) and forwards `autoFocus` to its first segment via the shared `focusable` utility.

Patches: `openDialog` defers `flushSync` to a microtask so callers can invoke it from `useEffect`; `Alert` icon alignment + live-region role; `FormErrors` renders via `Alert`; `Combobox` list spacing + neutral empty-state color; zod `GlobalMeta.hint` augmentation repaired; `collectNetworkValues` tightened; type assertions restored where soundness required; `popover` Surface variant drops its `--focus-color` override; internal rename `Modal/Modal.tsx` → `Modal/index.tsx`; new Storybook coverage for elevation/inset-surface/motion-spring plugins and a `ServerSideValidation` Form demo.
