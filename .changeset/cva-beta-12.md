---
'@codaco/fresco-ui': patch
---

Update `cva` to 1.0.0-beta.12. The `compose` helper exported from
`@codaco/fresco-ui/utils/cva` is now deprecated, because cva 1.0.0-beta.11
removed it upstream: use `cva({ composes: [a, b] })` instead. `compose` keeps
working as before, including each composed component falling back to its own
`defaultVariants`. Rendered class names are unchanged.
