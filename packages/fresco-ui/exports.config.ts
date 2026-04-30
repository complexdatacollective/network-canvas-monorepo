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

	// Primitives
	{ subpath: "./badge", source: "badge.tsx" },
	{ subpath: "./button-constants", source: "button-constants.ts" },
	{ subpath: "./Pips", source: "Pips.tsx" },
	{ subpath: "./ProgressBar", source: "ProgressBar.tsx" },
	{ subpath: "./ResizableFlexPanel", source: "ResizableFlexPanel.tsx" },
	{ subpath: "./ScrollArea", source: "ScrollArea.tsx" },
	{ subpath: "./skeleton", source: "skeleton.tsx" },
	{ subpath: "./Spinner", source: "Spinner.tsx" },
	{ subpath: "./TimeAgo", source: "TimeAgo.tsx" },

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

	// Styles
	{ subpath: "./styles/controlVariants", source: "styles/controlVariants.ts" },

	// Tailwind plugins (loaded by consumers via @plugin)
	{ subpath: "./styles/plugins/elevation", source: "styles/plugins/elevation/elevation.ts" },
	{ subpath: "./styles/plugins/inset-surface", source: "styles/plugins/inset-surface/inset-surface.ts" },
	{ subpath: "./styles/plugins/motion-spring", source: "styles/plugins/motion-spring.ts" },
];

export const cssEntries: ExportEntry[] = [
	{ subpath: "./styles.css", source: "styles.css" },
	{ subpath: "./styles/colors.css", source: "styles/colors.css" },
];
