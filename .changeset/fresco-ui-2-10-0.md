---
"@codaco/fresco-ui": minor
---

New `Accordion` component (wraps base-ui's accordion primitives behind `Accordion`/`AccordionItem`/`AccordionHeader`/`AccordionTrigger`/`AccordionPanel`, registered at `./Accordion`, ships with Storybook coverage and a new `motionSafeProps` utility that strips motion props when `prefers-reduced-motion` is set).

New `RadioItem` named export from `./form/fields/RadioGroup` — the styled radio item extracted from `RadioGroupField`'s per-option `.map` so it can be reused inside other base-ui `RadioGroup` parents. `RadioGroupField`'s behavior and markup are unchanged.

`RichSelectGroup` now uses listbox semantics in single-select mode (decoupled focus from selection; `Home`/`End` jump to first/last; new `autoFocus` prop; optional `description`; horizontal mode sizes container to content; `useColumns` is now an explicit prop). Single-select and multi-select branches are now separate JSX subtrees with static `role`/aria attributes (works around Biome's `useAriaPropsSupportedByRole` ternary-resolution limitation).

`Surface` API simplification — **breaking for consumers passing `elevation`, `bleed`, or `dynamicSpacing`.** Those three props are dropped; consumers apply `shadow-*` utilities at the call site for elevation, and the spacing scale now resolves to static asymmetric padding (`px-N py-M`) at each tier. Default `spacing` shifts to `'md'` and each tier's `shadow-*` is bumped up one step so the resting depth matches the prior "low" elevation. `Surface` is also now `min-h-0` by default so it can shrink in flex contexts.

`Node`'s `tabIndex` defaults to `-1` when no `onClick` is provided, so passive nodes drop out of the tab order.

Typography rhythm: `Heading`, `Paragraph`, and the list components switch to em-based top/bottom margins (rem-anchored `--spacing-base` from tailwind-config alpha.17 no longer scales `mb-*` per element). `h4` drops from `font-extrabold` to `font-bold`, and the `h4 + all-caps` compound downsizes to `text-sm`.

Theme cascade fixes for components that previously rendered a default-theme value inside `<ThemedRegion theme="interview">`:

- `Node` selection ring: motion `boxShadow` keyframes reference `var(--selected)` instead of `var(--color-selected)`, so the cascade picks up the interview override at the animated element.
- `Alert` `[--color-link:…]` variant overrides, `Button` `interview:[--component-text:…]` hover override, `Dialog` accent overrides, and `animate-pulse-glow` keyframes in `theme.css` swap to bare primitive vars for the same reason.

`PortalContainer` is now a viewport-sized stacking context (`fixed inset-0 isolate z-50 pointer-events-none`) above sibling stage content; portaled roots get pointer events back via `[&>*]:pointer-events-auto` so dialog backdrops/popups don't ignore clicks. DnD drag preview portals into the themed `PortalContainer` rather than `document.body`.

`ProgressBar` uses fixed `w-3/h-3` for the bar thickness (instead of `calc(0.7 * var(--theme-root-size))`) and gates the `data-complete` pulse-glow animation behind `motion-safe:`. `ResizableFlexPanel` only applies `overflow: hidden` during the collapse transition. Lucide default stroke-width drops from `2.5` to `2`.
