# architect-vite form-field SCSS-to-Tailwind migration — design

**Date:** 2026-04-23
**Branch:** `design/refinement`
**Scope:** foundational session (Option B) for the wider effort to remove all legacy stylesheets from `apps/architect-vite`. This session establishes patterns, token system, and plugins, and fully migrates the **form-field cluster** as the demonstration.

## Goal

Remove the form-field legacy stylesheets from `apps/architect-vite` and replace them with Tailwind + CVA, using `fresco-next`'s form-field system as both the visual reference and the design-system source of truth. All subsequent migrations will consume the same tokens, plugins, and variant primitives.

## Out of scope

- Non-field clusters (cards, buttons, dialogs, panels, stage-editor, ProtocolSummary, etc.)
- Responsive behavior beyond what fresco already ships
- Dark-mode support (fresco has hooks for it; we drop them for now — `.scheme-dark` path inside `nativeSelectVariants` is removed)
- Adopting fresco's `publish-colors` / elevation on existing components — only plugins are registered; consumption happens in future sessions
- `tailwind-motion-spring` plugin, `scroll-area-viewport` utilities, `interview`/`dashboard` custom variants

## Guiding principles

- **Prefer fresco tokens** — the tokens, utilities, and variants of `fresco-next` are the target. Compatibility with the fresco design system is the goal so future migrations are drop-in.
- **Theme values only** — no arbitrary Tailwind values (`w-[137px]`, etc.) unless unavoidable; if needed, a new semantic, generalisable token is introduced.
- **Reusability** — every reusable style lives in CVA variant fragments in a single shared module. Field components compose, not duplicate.
- **Standardized spacing** — spacing comes from the spacing scale; component variants pick the closest existing size rather than introducing new values.
- **Rip-and-replace** over aliases. No deprecated tokens linger.

## Architecture overview

```
src/
  styles/
    tailwind.css              ← adds breakpoints, plugins, forms plugin, focus utilities; removes *-foreground for *-contrast
    plugins/
      tailwind-inset-surface/
        index.ts              ← ported verbatim from fresco-next
      tailwind-elevation/
        index.ts              ← ported verbatim from fresco-next
        jwc.ts
        utils.ts
    shared/
      controlVariants.ts      ← ported verbatim from fresco-next (one edit: drop scheme-dark branch)
  utils/
    getInputState.ts          ← redux-form meta → stateVariants state string
  components/
    Form/
      BaseField.tsx           ← ported from fresco, adapted to redux-form meta shape
      FieldLabel.tsx          ← ported from fresco
      FieldErrors.tsx         ← ported from fresco
      Hint.tsx                ← ported from fresco
      Fields/
        *.tsx                 ← rewritten to consume CVA variants via BaseField
```

## Detailed design

### 1. Scope: files migrated and files deleted

**Fresco-styled fields (direct visual port):** `Text.tsx`, `Number.tsx`, `Search.tsx`, `TextArea.tsx`, `Checkbox.tsx`, `CheckboxGroup.tsx`, `Radio.tsx`, `RadioGroup.tsx`, `Toggle.tsx`, `BooleanField.tsx`, `lib/legacy-ui/components/Boolean/*`, `DatePicker/Field.tsx`, `Slider.tsx` (+ `Slider/*`), `LikertScale.tsx`, `NativeSelect.tsx`, `Select.tsx`, `RichText.tsx` (+ `RichText/*`), `MultiSelect.tsx`.

**Structural-only fields** (CSS → CVA, but visuals remain architect-specific since no fresco analogue exists): `ColorPicker.tsx`, `DataSource.tsx`, `Image.tsx`, `Video.tsx`, `Audio.tsx`, `File.tsx`, `Markdown.tsx`, `MarkdownLabel.tsx`, `InputPreview.tsx`, `VariablePicker/*`, `Geospatial/*`, `sections/fields/EntitySelectField/*`.

**CSS files deleted by end of session:**
- All files under `src/styles/components/form/fields/` (18 files)
- All files under `src/lib/legacy-ui/styles/components/form/fields/` (13 files)
- `src/lib/legacy-ui/styles/components/form/fields.css`
- `src/styles/components/form/field-error.css`
- Aggregator `@import` lines for the deleted files in `src/styles/components/form.css` and `src/lib/legacy-ui/styles/components/form/fields.css`

**Retained (out of scope):** `src/styles/components/form/dropzone.css`, `src/styles/components/form/round-button.css`.

### 2. Token system — fresco compatibility via rip-and-replace

All architect tokens that have a fresco equivalent are renamed. No aliases. Sweeps happen atomically in Phase 2.

**Renames (applied in `tailwind.css` and across all `.ts/.tsx/.js/.jsx/.css` files):**

| old | new |
|---|---|
| `--color-input-foreground` | `--color-input-contrast` |
| `--color-primary-foreground` | `--color-primary-contrast` |
| `--color-secondary-foreground` | `--color-secondary-contrast` |
| `--color-accent-foreground` | `--color-accent-contrast` |
| `--color-action-foreground` | `--color-action-contrast` |
| `--color-timeline-foreground` | `--color-timeline-contrast` |
| `--color-success-foreground` | `--color-success-contrast` |
| `--color-warning-foreground` | `--color-warning-contrast` |
| `--color-info-foreground` | `--color-info-contrast` |
| `--color-error` | `--color-destructive` |
| `--color-error-foreground` | `--color-destructive-contrast` |
| `--color-surface-1-foreground` | `--color-surface-1-contrast` |
| `--color-surface-2-foreground` | `--color-surface-2-contrast` |
| `--color-surface-3-foreground` | `--color-surface-3-contrast` |
| `--color-surface-accent-foreground` | `--color-surface-accent-contrast` |
| `--color-sortable-foreground` | `--color-sortable-contrast` |
| `--color-border` | `--color-outline` |
| `--color-foreground` | `--color-text` |

Utility-class equivalents rewrite accordingly: `text-foreground` → `text-text`, `bg-error` → `bg-destructive`, `border-border` → `border-outline`, `text-*-foreground` → `text-*-contrast`, `bg-*-foreground` → `bg-*-contrast`, etc.

**New tokens introduced:**

| token | maps to |
|---|---|
| `--color-surface-popover` | `hsl(var(--white))` (mirror `surface-1` for now) |
| `--color-surface-popover-contrast` | `hsl(var(--navy-taupe))` (mirror `surface-1-contrast`) |

**Breakpoints:** replace Tailwind defaults with the fresco set via `--breakpoint-*: initial`:

```
--breakpoint-phone: 320px
--breakpoint-phone-portrait-max: 479px
--breakpoint-phone-landscape: 480px
--breakpoint-phone-landscape-max: 767px
--breakpoint-tablet-portrait: 768px
--breakpoint-tablet-portrait-max: 1023px
--breakpoint-tablet-landscape: 1024px
--breakpoint-tablet-landscape-max: 1279px
--breakpoint-laptop: 1280px
--breakpoint-laptop-max: 1535px
--breakpoint-desktop: 1536px
--breakpoint-desktop-max: 1919px
--breakpoint-desktop-lg: 1920px
--breakpoint-desktop-xl: 2560px
```

Pre-existing usages of default Tailwind breakpoints in architect code must be rewritten. A grep (`rg "(?<![a-z-])(?:sm|md|lg|xl|2xl):" --type-add 'web:*.{ts,tsx,css}' -t web`) identifies actual responsive utilities (not CVA size-variant keys, which share the names). The current set is confined to a handful of `md:` and `lg:` grid/flex utilities in `src/components/Home/*.tsx`:

| old | new |
|---|---|
| `md:grid-cols-2` | `tablet-portrait:grid-cols-2` |
| `md:grid-cols-3` | `tablet-portrait:grid-cols-3` |
| `lg:grid-cols-3` | `tablet-landscape:grid-cols-3` |
| `md:flex-row` | `tablet-portrait:flex-row` |

The mapping rule (for any additional instances found during the sweep): `sm→phone-landscape`, `md→tablet-portrait`, `lg→tablet-landscape`, `xl→laptop`, `2xl→desktop`. Apply this sweep in Phase 2 alongside the token rename.

### 3. Plugins

Ported verbatim from fresco-next; sit in `src/styles/plugins/`:

- **`tailwind-inset-surface/index.ts`** — adds `inset-surface` utility. Each `bg-*` utility sets `--inset-bg` via `matchUtilities`; shadow/highlight colors derive from it via `oklch from var(--inset-bg)`. Consumed by `sliderTrackVariants`.

- **`tailwind-elevation/` (three files)** — `index.ts`, `jwc.ts`, `utils.ts`. Adds `elevation-low`/`-medium`/`-high`/`-none` plus the `publish-colors` marker. Intercepts `bg-*` and `text-*` utilities to populate `--scoped-bg` / `--scoped-text`. Consumed by fresco's stepper-button pattern inside `InputField`; otherwise dormant until future sessions.

- **`@tailwindcss/forms`** — official Tailwind plugin. Added to `tailwind.css` via `@plugin '@tailwindcss/forms'`. Needed because fresco's field styles rely on its reset.

Registration added to `tailwind.css`:
```css
@plugin '@tailwindcss/forms';
@plugin './plugins/tailwind-inset-surface/index.ts';
@plugin './plugins/tailwind-elevation/index.ts';
```

Utilities added to `tailwind.css`:
```css
@utility focus-styles { @apply outline-4 outline-offset-3 transition-all duration-200 ease-in-out; }
@utility focusable   { outline-color: var(--focus-color, currentColor); @apply focus-visible:focus-styles; }
@utility focusable-within { outline-color: var(--focus-color, currentColor); @apply focus-visible-within:focus-styles; }
@custom-variant focus-visible-within (&:has(:focus-visible));
```

### 4. Shared CVA variants module

`src/styles/shared/controlVariants.ts` — verbatim port of `fresco-next/styles/shared/controlVariants.ts`.

Exports: `smallSizeVariants`, `controlVariants`, `textSizeVariants`, `heightVariants`, `proportionalLucideIconVariants`, `inputControlVariants`, `inlineSpacingVariants`, `wrapperPaddingVariants`, `groupSpacingVariants`, `placeholderVariants`, `multilineContentVariants`, `stateVariants`, `interactiveStateVariants`, `orientationVariants`, `controlLabelVariants`, `dropdownItemVariants`, `nativeSelectVariants`, `groupOptionVariants`, and the slider family (`sliderRootVariants`, `sliderControlVariants`, `sliderTrackVariants`, `sliderThumbVariants`, `sliderTickContainerStyles`, `sliderTickStyles`).

**Deviations from fresco's source:**
- `nativeSelectVariants` — remove the `in-[.scheme-dark]:bg-[url(...)]` branch (architect has no dark scheme); retain the light-chevron data-URL only

### 5. Field wrapper primitives

Ported from fresco (`lib/form/components/Field/BaseField.tsx` + surrounding helpers) into `src/components/Form/`:

- **`BaseField.tsx`** — renders label + hint + errors + children. Same props as fresco's version. Consumes `FieldLabel`, `FieldErrors`, `Hint`.
- **`FieldLabel.tsx`** — renders the field label with required indicator. Takes children so `<MarkdownLabel>` can be nested inside.
- **`FieldErrors.tsx`** — renders error list; replaces per-field error markup and eventually supplants `FieldError.tsx` + `field-error.css`.
- **`Hint.tsx`** — renders hint/help text under the label.

Adaptation to redux-form: `BaseField` consumers pass `errors` (string[]) and `showErrors` (boolean) derived from redux-form's `{ meta: { error, touched, invalid } }`. The `containerProps` escape hatch mirrors fresco's shape for future motion-prop compatibility.

**`src/utils/getInputState.ts`** — signature: `(props: { disabled?: boolean; readOnly?: boolean; meta?: { touched?: boolean; invalid?: boolean } }) => 'normal' | 'disabled' | 'readOnly' | 'invalid'`. Precedence: `disabled` → `readOnly` → `invalid` (only when touched) → `normal`.

### 6. Field component rewrite pattern

Each fresco-styled field becomes a thin wrapper:

```tsx
function TextInput({ input, meta, label, hint, size = 'md', disabled, readOnly, ...props }) {
  const state = getInputState({ disabled, readOnly, meta });
  const errors = meta?.error ? [meta.error] : [];
  const showErrors = Boolean(meta?.touched && meta?.invalid);

  return (
    <BaseField id={id} name={input.name} label={label} hint={hint}
               errors={errors} showErrors={showErrors}>
      <div className={inputWrapperVariants({ size, state })}>
        <input {...input} disabled={disabled} readOnly={readOnly}
               className={inputVariants({})} />
      </div>
    </BaseField>
  );
}
```

The composed variants (`inputWrapperVariants`, `inputVariants`, `stepperButtonVariants`) live inside the field file, not in `controlVariants.ts`, because they're specific compositions of the shared fragments. The shared fragments stay generic; field-specific compositions stay in field files. This matches fresco's own structure.

### 7. Execution order (seven phases)

Each phase ends with typecheck + build + lint + dev-server smoke test and a commit. No phase starts until the previous one is clean.

1. **Plugins & theme foundations** — install `@tailwindcss/forms`, port plugins, add breakpoints + focus utilities
2. **Token rename sweep** — rip-and-replace renames across architect-vite; visual smoke test
3. **Shared variants module** — create `controlVariants.ts` + `getInputState.ts`
4. **BaseField + helpers** — create the four wrapper components
5. **Fresco-styled field migration** — one field at a time, in dependency order: Text/Number/Search, TextArea, NativeSelect, Checkbox+Radio, CheckboxGroup+RadioGroup, Toggle, BooleanField, DatePicker, Slider+LikertScale, Select, RichText, MultiSelect. Each field migration deletes its CSS file and de-references the aggregator.
6. **Structural-only field migration** — orphan fields: ColorPicker, DataSource, Image/Video/Audio/File, Markdown, InputPreview, VariablePicker, EntitySelect, Geospatial
7. **Cleanup** — delete remaining field CSS files, remove aggregator imports, delete `field-error.css`, run `knip`, full smoke test

### 8. Verification criteria

- `pnpm --filter architect-vite typecheck` clean
- `pnpm --filter architect-vite build` clean
- `pnpm --filter architect-vite lint` clean — no new Biome suppressions
- Dev server boots with no console errors
- Every field type renders correctly in Stage Editor and Protocol settings (manual walk-through)
- No arbitrary Tailwind values introduced outside those already in fresco's ported variants (grep-verify)
- All targeted CSS files deleted; aggregator imports updated
- `pnpm --filter architect-vite knip` reports no new dead exports

### 9. Risks and mitigations

- **`@tailwindcss/forms` global reset may visually shift non-migrated fields.** Mitigation: Phase 5 runs to completion in the same session as Phase 1. If regressions appear mid-phase, we ship fixes inline rather than defer.
- **Token rename misses CSS-file raw variable references.** Mitigation: sweep greps for both the `--color-*` form and the utility-class form; grep-driven, not find-and-replace-driven.
- **redux-form `meta` shape differs per field** (some fields don't pass `meta`). Mitigation: `getInputState` accepts optional `meta` and falls through to `normal`.
- **Elevation plugin requires `publish-colors` up-tree for shadow color inheritance.** Mitigation: none of the migrated fields use elevation directly; plugin is registered but dormant until consumed.
- **Breakpoint rename breaks pre-existing responsive utilities.** Mitigation: Phase 2 sweep uses the explicit mapping table in Section 2. Current scope is four utilities in `src/components/Home/*.tsx`; the grep runs again before Phase 3 to catch any newly added usages.
- **CVA size-variant keys use `sm/md/lg/xl` names**, which the grep for breakpoint utilities could false-positive on. Mitigation: the grep pattern `(?<![a-z-])(?:sm|md|lg|xl|2xl):` with manual review of each hit; CVA variant keys appear as object-literal keys (`sm: "size-20"`), not as class-name prefixes (`sm:grid-cols-2`), and the two forms are easy to distinguish by eye.

## Open questions

None as of design freeze.
