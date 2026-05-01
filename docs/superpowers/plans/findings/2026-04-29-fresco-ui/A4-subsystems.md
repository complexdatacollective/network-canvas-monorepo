# A4: Inspect the four subsystems for hidden coupling

**Date:** 2026-04-29
**Repo inspected:** `~/Projects/fresco-next` (read-only)
**Subsystems:** `components/ui/{form, collection, dnd, dialogs}`
**Disposition:** DONE — no surprise couplings beyond what was already accounted for in the migration scope. One previously-named external import (`controlVariants`) has more form-side consumers than the brief implied; resolution is unchanged (relocate `~/styles/shared/controlVariants` into the package). Test-setup deps are exclusively jsdom + `@testing-library/jest-dom` + a few generic browser polyfills already required by other parts of the package.

---

## Method

```bash
for sub in form collection dnd dialogs; do
  echo "=== $sub ==="
  grep -rh "from '~/" ~/Projects/fresco-next/components/ui/$sub 2>/dev/null \
    | grep -v "from '~/components/ui" \
    | sort -u
done
```

Plus targeted greps for `vi.mock`, `vitest.setup`, `setupFiles`, and a per-import file census so no usage hides behind a single line.

The migration brief already accounts for these utilities being part of the migrated surface (so they are not "external coupling" for the purposes of this audit):

- `~/utils/cva` (cva, cx, compose, VariantProps)
- `~/styles/shared/controlVariants` (and its `dropdownItemVariants`, `nativeSelectVariants` exports)
- `~/utils/generatePublicId`
- `~/utils/prettify`
- `~/hooks/useSafeAnimate`
- `~/lib/interviewer/utils/scrollParent`

These are listed below for completeness but are not flagged as new coupling.

---

## form

### External imports (every `~/...` outside `~/components/ui/...`)

| Import | Files | Migration status |
|---|---|---|
| `~/utils/cva` (cva, cx, compose, VariantProps) | many fields/components | already in scope |
| `~/styles/shared/controlVariants` (incl. `dropdownItemVariants`, `nativeSelectVariants`) | 20 files (all under `form/components/fields/**` — InputField, RichSelectGroup, SegmentedCodeField, Boolean, VisualAnalogScale, ToggleField, Checkbox, RadioGroup, CheckboxGroup, LikertScale, Combobox/{shared,Combobox}, RichTextEditor, TextArea, Select/{shared,Native,Styled}, ToggleButtonGroup, ArrayField/ArrayField) | already in scope (the brief enumerates `controlVariants`) |
| `~/lib/interviewer/utils/scrollParent` | `form/utils/focusFirstError.ts` (1 file) | already in scope |
| `~/lib/interviewer/selectors/forms` | `form/hooks/useProtocolForm.tsx` (1 file — confirmed no other consumers) | leave behind (this file stays in Fresco per the plan) |

No imports of `~/lib/...` (other than the two above), `~/actions/...`, `~/queries/...`, `~/schemas/...`, or `~/app/...` were found. **No new coupling.**

### Test setup dependencies

- Test files: `form/components/fields/__tests__/{DatePicker.test.tsx, getPasswordStrength.test.ts}`, `form/validation/functions.test.ts`, `form/store/formStore.test.ts`.
- All `~/` imports in tests resolve inside `~/components/ui/form/...` — no Fresco-specific fixtures, factories, or mocks.
- `vi.mock` calls in form test files: **none** beyond app-internal targets (no Fresco modules mocked).
- Tests need: `jsdom`, `@testing-library/react` (implied by `DatePicker.test.tsx`), and `@testing-library/jest-dom/vitest` (loaded globally by `vitest.setup.ts`). They also use the global motion mock and `ResizeObserver`/`offsetWidth`/`Worker`/`Intl.DateTimeFormat` shims from the project-level `vitest.setup.ts`.

### Recommended action

**Clean migrate.** Move all of `components/ui/form/**` into the package **except** `form/hooks/useProtocolForm.tsx`, which stays behind in Fresco (relocated to `lib/interviewer/forms/` per the brief). The package will need its own equivalents of `vitest.setup.ts` shims (motion mock, ResizeObserver, Worker, Intl.DateTimeFormat, jest-dom matchers) — these are not Fresco-domain, they are generic jsdom polyfills, but the package must reproduce them to keep these tests green.

---

## collection

### External imports

| Import | Files | Migration status |
|---|---|---|
| `~/utils/cva` (cx) | broad usage in collection components | already in scope |
| `~/hooks/useSafeAnimate` | `collection/hooks/useStaggerAnimation.ts` (1 file) | already in scope |
| `~/.storybook/preview` | `collection/stories/Collection.stories.tsx` (1 file) | story-only — see below |

The `~/.storybook/preview` import is **not** a runtime coupling — it is a Storybook CSF3 `preview.meta(...)` usage in a story file. It mirrors the same pattern other stories in the repo use to bind to the project-wide Storybook config. The package will ship its own `.storybook/preview.tsx`; the story will rebind to the package's preview after migration. Treated as story-rebinding, not coupling.

### Test setup dependencies

- Tests under `collection/__tests__/` (17 files; mix of `.test.ts` and `.test.tsx`).
- `vi.mock` calls: **only one** — `collection/__tests__/filtering.test.tsx` mocks `'../hooks/useSearchWorker'` (relative path, internal to the subsystem). No Fresco modules mocked.
- Tests rely on the project `vitest.setup.ts` for: jsdom, `ResizeObserver` mock with the **800×600 contentRect** payload (Collection-specific — the comment in setup explicitly says "must be invoked with width > 0 so Collection can measure items"), `offsetWidth`/`offsetHeight` (also explicitly for Collection's `useCollectionSetup`), `Worker` mock (collection's `search.worker.ts` is exercised), and motion mocks. No Fresco-domain dependencies.

### Recommended action

**Clean migrate.** All collection sources move as-is. The package's vitest setup must include the same ResizeObserver/offsetWidth/Worker/motion shims — these were originally added *for* Collection, so they belong with it. The single `vi.mock` call uses a relative path and migrates unchanged.

---

## dnd

### External imports

| Import | Files | Migration status |
|---|---|---|
| `~/utils/prettify` (`Prettify` type) | `dnd/useDragSource.tsx`, `dnd/useDropTarget.ts` (2 files) | already in scope |

No other `~/` imports. **No new coupling.**

### Test setup dependencies

- Tests under `dnd/__tests__/`: `hooks.test.ts`, `store.test.ts`, plus a local `setup.ts`.
- The local `setup.ts` is **self-contained**: it polyfills `ResizeObserver`, `IntersectionObserver`, `requestAnimationFrame`/`cancelAnimationFrame`, `PointerEvent`, `getBoundingClientRect`, and `setPointerCapture`/`releasePointerCapture` using inline `vi.fn()` mocks. It imports nothing from Fresco.
- `vi.mock` calls in dnd test files: **none** (zero matches against `vi.mock(`).
- Tests need: jsdom and the local `setup.ts`. They do *not* use `@testing-library/react` (no `.test.tsx` files in `__tests__/`).

### Recommended action

**Clean migrate.** dnd is the most isolated of the four — its tests already carry their own setup file and need no Fresco support. Move `dnd/__tests__/setup.ts` alongside the test files.

---

## dialogs

### External imports

| Import | Files | Migration status |
|---|---|---|
| `~/utils/cva` (cx) | broad usage | already in scope |
| `~/utils/generatePublicId` | `dialogs/DialogProvider.tsx` (1 file) | already in scope |

No other `~/` imports. **No new coupling.**

### Test setup dependencies

- Tests under `dialogs/__tests__/`: `dialogTypes.test.tsx`, `wizardDialog.test.tsx`.
- `vi.mock` calls: **none**.
- Tests need: jsdom, `@testing-library/react`, `@testing-library/jest-dom/vitest`, and the motion mock from the project `vitest.setup.ts` (Dialog uses motion for transitions). No Fresco-domain deps.

### Recommended action

**Clean migrate.** Same shared-setup needs as form/collection (jsdom + jest-dom + motion mock). No reshape required.

---

## Cross-cutting summary

| Subsystem | Action | New coupling? | Notes |
|---|---|---|---|
| form | clean migrate (minus `useProtocolForm.tsx`) | no | leave-behind file already named in plan |
| collection | clean migrate | no | story rebinds to package's `.storybook/preview` |
| dnd | clean migrate | no | self-contained test setup |
| dialogs | clean migrate | no | — |

### Shared `vitest.setup.ts` shims the package will need

These are currently in `~/Projects/fresco-next/vitest.setup.ts` and are **generic jsdom plumbing**, not Fresco-domain. They must be reproduced in the package's vitest setup or several test suites will fail. None of them require Fresco code:

1. `import '@testing-library/jest-dom/vitest'` — needed by form (DatePicker), dialogs.
2. Motion (`motion/react`, `framer-motion`, `motion-dom`) mock module — needed by collection, dialogs, parts of form. The mock is large (~200 lines) but standalone.
3. `ResizeObserver` mock with 800×600 contentRect — needed by collection (and consequently any form fields rendered inside Collection-shaped tests).
4. `Element.prototype.scrollTo` no-op polyfill.
5. `Intl.DateTimeFormat` pinned to `en-US` — needed by `DatePicker.test.tsx` to keep locale-formatted assertions stable.
6. `HTMLElement.prototype.offsetWidth` / `offsetHeight` getters returning 800/600 — needed by collection.
7. `Worker` mock — needed by collection's search worker.

dnd brings its own `__tests__/setup.ts` and does not depend on the global setup.
