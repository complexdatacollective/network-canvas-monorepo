// Public API allowlist for @codaco/fresco-ui.
//
// Each entry is { subpath, source }:
//   - `subpath` is what consumers import (`./Button` → `@codaco/fresco-ui/Button`)
//   - `source` is the file under `src/` that the entry resolves to
//
// Keep this list curated and minimal. Anything NOT listed here is treated as
// private and not added to package.json `exports` — even if it's compiled into
// dist by Vite. This is how subsystem internals stay package-private.

export type ExportEntry = { subpath: string; source: string };

export const exportEntries: ExportEntry[] = [{ subpath: "./_placeholder", source: "_placeholder.ts" }];

export const cssEntries: ExportEntry[] = [];
