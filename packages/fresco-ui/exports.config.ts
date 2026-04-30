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

export const exportEntries: ExportEntry[] = [
	{ subpath: "./_placeholder", source: "_placeholder.ts" },

	{ subpath: "./utils/cva", source: "utils/cva.ts" },
	{ subpath: "./utils/generatePublicId", source: "utils/generatePublicId.ts" },
	{ subpath: "./utils/prettify", source: "utils/prettify.ts" },
	{ subpath: "./utils/composeEventHandlers", source: "utils/composeEventHandlers.ts" },
	{ subpath: "./utils/NoSSRWrapper", source: "utils/NoSSRWrapper.tsx" },
	{ subpath: "./utils/scrollParent", source: "utils/scrollParent.ts" },

	{ subpath: "./hooks/useSafeAnimate", source: "hooks/useSafeAnimate.ts" },
	{ subpath: "./hooks/useNodeInteractions", source: "hooks/useNodeInteractions.ts" },
	{ subpath: "./hooks/usePrevious", source: "hooks/usePrevious.ts" },
	{ subpath: "./hooks/useResizablePanel", source: "hooks/useResizablePanel.ts" },
	{ subpath: "./hooks/useSafeLocalStorage", source: "hooks/useSafeLocalStorage.tsx" },
];

export const cssEntries: ExportEntry[] = [];
