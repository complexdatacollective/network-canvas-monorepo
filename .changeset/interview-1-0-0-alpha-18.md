---
"@codaco/interview": prerelease
---

`Narrative/PresetSwitcher` rebuilt on top of fresco-ui's `Popover`/`Accordion`/`RadioItem` wrappers, with a drag-handle button driven by `useDragControls` and a pure-toggle popover (only the trigger opens or closes it). The floating panel uses `Surface spacing='sm'` with explicit `shadow-xl`, accordion sections flatten their header into a single `Trigger` that applies `headingVariants()` directly, and the unused `presetLabelVariants`/`presetContentVariants`/`prevPresetRef` from the prior `AnimatePresence`-based version are removed.

`OneToManyDyadCensus` rebuilt around the shared `Panel` + `NodeList` primitives. Replaces the hand-rolled `Surface`/`Heading`/`Collection` stack so the targets list matches the established node-list pattern (header, sizing, animation, DnD-ready). Focal source renders at size `'md'`, collection items at `'sm'`. `Panel` now forwards `className` so consumers can constrain its width. Panel title copy clarified.

`DyadCensus` and `TieStrengthCensus` migrated to listbox semantics. `TieStrengthCensus` replaces `BooleanOption` with `RichSelectGroup` (horizontal listbox); `BooleanOption` is deleted. The two duplicate `Pair` components consolidate into a single shared component with an optional SR-only `labelId`. Both stages wire `aria-labelledby` on the response field to the pair label + `Prompts` id, so screen readers announce "Alice and Bob, [prompt], listbox, [option]" on focus arrival. `Prompts` accepts and forwards an `id` prop.

Intro/explanation markdown bodies now render through `ALLOWED_MARKDOWN_SECTION_TAGS`, so plain-text content renders inside `<p>` instead of being unwrapped. `IntroPanel` drops the wrapping `<span>` (invalid markup around block content).

Synthetic data:

- `addNodeType` auto-adds a `'name'` text variable to every node type. The existing `getNetwork` attribute-fill path already populates text variables with faker `firstNames`, and `getNodeLabelAttribute` already prefers a variable named `'name'`, so synthetic nodes now get realistic seed-deterministic labels instead of the `'Person'`-typed fallback.
- `addStage`'s `initialNodes: number` is now `{ count, promptIndex? }`. The optional `promptIndex` resolves to a real `promptID` at `getNetwork()` time so panel nodes carry a realistic prior promptID.

Theme cascade + `Shell` consolidation: extract a `theme-base` utility and apply it inside `ThemedRegion` (and `<body>`) so descendants re-resolve themed values; mount `DndStoreProvider` and the interview `Toast.Provider` inside `Shell` (hosts no longer need them); drop the unused `InterviewToastViewport` and `interviewToastManager` public exports. `ProgressBar`/`Spinner`/`NodeBin`/`PassphrasePrompter` switch from `rem` to `var(--theme-root-size)` so sizes scale with the theme's root size at breakpoints. `--radius` indirects through `--radius-base` so the bare `rounded` utility keeps a `var()` reference at use-site.

Spacing/container tokens now scale with `--theme-root-size` (via `@codaco/tailwind-config@1.0.0-alpha.17`). `Node` drops per-breakpoint `size-XX` variants; `Collection` layouts express `gap` in Tailwind spacing units (internal pixel math resolves the same `calc(N * var(--spacing-base, 0.25rem))` via a hidden measurement element); spacing tweaks across `NodeList`, `Panel`, `Prompt`, `FamilyPedigree`, `NameGenerator QuickAddField`/`Roster`, and `OneToManyDyadCensus`. The `pedigree-context-menu-hint` PNG is bundled via Vite import.

`NodeBin` renders the SVG via `<img src>` rather than `style={{ backgroundImage: url(...) }}` on a motion child (the inline `style` was silently dropped by React under `motion.div`). Interview's flex panel only applies `overflow: hidden` during collapse.

Storybook: `withTheme` decorator now also wraps stories in `ThemedRegion`; `data-theme-interview` restored on `document.body`; `NameGenerator` quick-add wires to the real codebook variable id (fixes `NETWORK/ADD_NODE/rejected`); `viteFinal` uses `mergeConfig` and pre-bundles `d3-force`.

Internal: adopt the `~/*` path alias via `tsconfig` paths. Relative imports deeper than one directory up rewrite to `~/...`; single-up (`../foo`) and same-dir (`./foo`) imports are left untouched. Vite rollup `external` excludes `~/*` so `preserveModules` resolves the alias to relative paths in the published `dist`.
