---
'@codaco/tailwind-config': minor
---

A destructive ink for tinted surfaces, `--destructive-strong`, declared in
every theme.

`--destructive` is a fill colour first. As text it clears WCAG AA on the page's
own white (4.9:1) and fails on `--surface-accent` (3.8:1) — a field error
inside an accent surface goes illegible at exactly the moment it has something
to say. The new variable is that colour moved toward the reader's own `--text`
until it is legible on the tint.

Destructive text now has its own token, `--destructive-ink`
(`text-destructive-ink`), so a surface can change the colour of its error text
without touching `--destructive`, which is also the fill of destructive buttons
and badges. Every theme declares `--destructive-ink` as its `--destructive`,
plus `--surface-destructive` and `--surface-accent-destructive` (the latter
defaulting to `--destructive-strong`), which Fresco UI's `Surface` sets the ink
to, the same way it sets `--link`. An app can override
`--surface-accent-destructive` when its accent surface needs a different ink.

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

How far the fill travels is chosen per scope as well, because how far it has to
travel depends on how light that scope's accent surfaces are. Measured on
`--surface-accent` and then on the deeper `--surface-accent-1`: default light
at 78% (5.00:1, 4.55:1), default dark at 70% (5.13:1, 4.62:1), studio light at
78% (5.46:1, 4.83:1), studio dark at 56% (5.66:1, 4.66:1), and interview, whose
accent surfaces are the darkest ground the token stands on anywhere, at 28%
(5.31:1, 4.69:1).

`--color-destructive-strong` maps to it, so `text-destructive-strong` and the
other generated utilities work anywhere. Reading `var(--color-destructive-strong)`
by hand does not: `@theme inline` substitutes the token into utilities at build
time, but the alias itself is declared once at `:root`. Fresco UI's Colors
story measures the ink in all five scopes: it fails if any of them inherits the
default theme's, and it fails if any of them draws below 4.5:1 on its own
first two accent steps.
