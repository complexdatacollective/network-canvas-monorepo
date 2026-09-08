---
'@codaco/tailwind-config': minor
---

A destructive ink for tinted surfaces, `--destructive-strong`, declared in
every theme.

`--destructive` is a fill colour first. As text it clears WCAG AA on the page's
own white (4.9:1) and fails on `--surface-accent` (3.8:1) — a field error
inside an accent surface goes illegible at exactly the moment it has something
to say. The new variable is that colour moved toward the reader's own `--text`
until it is legible on the tint, and a surface opts into it by setting
`[--destructive:var(--destructive-strong)]` on the destructive TEXT it holds,
so the colour every button, badge and page-level error uses does not move. On
the text and not on the tinted element itself, because a redeclaration is
inherited by the whole subtree below it: a destructive button there would have
its fill repainted while the icon on top of it, drawn with
`--destructive-contrast`, stayed where it was.

Both halves of the mixture are per-theme, so the mixture is declared in each
theme scope beside the pair it reads — default light and dark, studio light and
dark, and interview — rather than once in the `@theme` block. A custom
property's `var()`s are substituted on the element the declaration sits on, so
one copy at `:root` resolves against the light pair and cascades that single
answer into every region below it: on the dark accent surface the error ink
would land at 2.04:1, below the 3.44:1 of the plain `--destructive` it exists
to improve on, where a mixture made in the dark scope reaches 4.63:1. It is the
same rule that already makes `--surface-accent` and the radius scale redeclare
themselves per theme.

`--color-destructive-strong` maps to it, so `text-destructive-strong` and the
other generated utilities work anywhere. Reading `var(--color-destructive-strong)`
by hand does not: `@theme inline` substitutes the token into utilities at build
time, but the alias itself is declared once at `:root`. Fresco UI's Colors
story measures the ink in all five scopes and fails if any of them inherits the
default theme's.
