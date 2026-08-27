# Adding a shared Fresco UI component

Read this reference only when adding a new public `@codaco/fresco-ui` component or export subpath. Ordinary application UI changes should use the existing public surface and do not need these instructions.

## Public API and exports

- Mirror the closest component's prop shape, variants, and file structure.
- Compound components are named exports from one file, named after the underlying Base UI parts. Do not add a barrel or a `.` namespace.
- Add the source-first subpath to `packages/fresco-ui/package.json` `exports`.
- Run `pnpm --filter @codaco/fresco-ui sync-exports` to regenerate the dist-pointing `publishConfig.exports` map. A Vitest guard fails when the maps drift.
- No dependency build or watcher is needed; workspace consumers compile Fresco UI from `src`.

## Responsive sizing

- Use container queries, not viewport breakpoints. A shared component knows its container rather than the page viewport.
- Make the relevant component region an `@container` and use `@min-[…]` queries for its descendants.
- Give flexible parts a floor and a cap that step up together as the container grows.
- Let content flow. Do not use a fixed height or width that clips controls or wraps labels unexpectedly.

## Storybook documentation

Add a co-located `*.stories.tsx` file with `tags: ['autodocs']`.

- Render the component bare. Do not add a decorative card, background, padding, or fixed wrapper that is not part of the component API.
- Drive size and context through the component's own props, `style`, or `className`.
- Put a real import and composition example plus a per-part props list in `parameters.docs.description.component`.
- Expose meaningful variations as controls: icons, label length, width, state, and other public options.
- Add preset stories for edge cases such as long labels, narrow and wide containers, overflow, and icon-less variants.
- Keep story helpers unexported; a non-story export becomes an invalid auto-story.

## Completion check

- The new component is founded on the appropriate Base UI primitive when interactive.
- Keyboard behaviour, focus, accessible names, and dynamic announcements are covered.
- Source and publish export maps are synchronized.
- Stories document composition, controls, and edge cases.
- Focused component tests and the Fresco UI typecheck pass.
