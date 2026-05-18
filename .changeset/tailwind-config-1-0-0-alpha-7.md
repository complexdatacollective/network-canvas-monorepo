---
'@codaco/tailwind-config': prerelease
---

Three coordinated changes:

1. **Type scale is now em-based** instead of rem-based. `--text-*` tokens emit em-relative values, so `text-base` / `text-lg` / etc. inherit ancestor font-size and scale together with em-based spacing utilities (`p-4`, `gap-2`, `size-20`). Inside `[data-theme-interview]` the responsive 16/18/20px font-size override now cascades through every typography utility too — fresco-ui controls (Button, Heading, Node) that previously broke the spacing scale by applying `text-*` no longer pin themselves to the root rem value.

2. **Both themes now ship inside `fresco.css`.** The `./fresco/themes/default.css` and `./fresco/themes/interview.css` exports have been removed; consumers no longer need to import them separately. The themes don't conflict at runtime — the default writes `:root` values, and the interview theme scopes its overrides to `:root:has([data-theme-interview])`, which only matches when an interview Shell is mounted.

3. **The interview theme attribute is now `data-theme-interview`** (was `data-interview`). More descriptive, less likely to collide with consumer attributes. The `:root:has(...)` selector and the `interview:` / `dashboard:` `@custom-variant` selectors are updated accordingly. Consumers using `@codaco/interview`'s Shell get this for free; anything that sets the attribute directly must be updated.

Also fixes the Inclusive Sans variable-weight migration: previous in-branch work pointed both `@font-face` blocks at the wrong files and used an out-of-range weight. Both blocks now use `format('woff2-variations')` and weight range `300 700`.
