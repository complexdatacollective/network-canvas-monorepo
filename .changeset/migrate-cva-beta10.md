---
'@codaco/fresco-ui': patch
'@codaco/architect': patch
---

Bumps the `cva` dependency behind `cva`/`cx`/`compose`/`VariantProps`
(`@codaco/fresco-ui/utils/cva`) from `1.0.0-beta.4` to `1.0.0-beta.10`.
Rendered class output is unchanged.

One narrowing worth knowing if you import `compose` directly: `cva`'s
`compose()` no longer type-checks a composed component passed into another
`compose()` call (its declared return type doesn't carry the internal
property the check needs), so composing an already-composed variant function
now needs its own constituents listed directly rather than nesting the
composed function itself.
