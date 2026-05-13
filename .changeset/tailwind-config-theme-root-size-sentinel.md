---
"@codaco/tailwind-config": prerelease
---

Type scale rewritten to use a `--theme-root-size` sentinel custom property; the interview theme drops the `:root` requirement and binds to `[data-theme-interview]` on any element. Responsive font-sizes now also honor user OS text-zoom (rem-based instead of px-pegged). `interview:` and `dashboard:` `@custom-variant` selectors updated to support nested coexistence — `dashboard:` uses a `:not()` chain so it correctly excludes themed regions and their descendants instead of relying on the broken `:root` negation.

**Breaking** for any consumer that pinned to `:root[data-theme-interview]` selectors directly. The supported integration is via `<ThemedRegion theme="interview">` from `@codaco/fresco-ui` (or directly setting the attribute on a wrapper element).
