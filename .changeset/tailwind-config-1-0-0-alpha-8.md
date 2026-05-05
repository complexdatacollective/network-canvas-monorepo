---
"@codaco/tailwind-config": prerelease
---

Revert the `--text-*` tokens to rem-based values and rescope the interview theme to `:root[data-theme-interview]`.

The em-based scale shipped in alpha.7 had a known but uncalled-out failure mode: `text-*` utilities compound when nested. A `.text-2xl` inside a container that already applies `.text-xl` evaluated to `1.266 × 1.424 ≈ 1.8×` of the grandparent's font-size instead of the intended `1.424×`, which made prompt text inside Headings (and similar nested patterns) look dramatically larger than intended.

The fix is to keep the type scale as plain rem (no compounding — every `text-*` resolves against `<html>`'s font-size) and move the responsive font-size override onto `<html>` itself. The interview theme now scopes its block to `:root[data-theme-interview]`, which `@codaco/interview`'s Shell sets via a `useLayoutEffect` while mounted. With the override on `:root`, `1rem` becomes 16/18/20px document-wide and every `text-*` / `p-*` / `gap-*` utility scales together — without compounding.

Selectors updated:
- `:root:has([data-theme-interview])` → `:root[data-theme-interview]` for variable assignments
- `[data-theme-interview]` → `:root[data-theme-interview]` for the responsive font-size override
- `interview:` / `dashboard:` `@custom-variant` selectors updated to the same `:root[data-theme-interview]` form
