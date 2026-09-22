---
'@codaco/architect': patch
'@codaco/fresco-ui': patch
---

Error messages inside a list item in Architect, such as the one under a
yes/no attribute's answer labels, can be read again. They were red on the
slate blue row and almost invisible. They now appear as white text in a red
box, the same treatment Fresco UI already uses for errors on coloured
backgrounds. Other destructive text on these rows, such as the required-field
marker, is drawn in a light tint that stays legible against the row.

In Fresco UI, `FieldErrors` now draws its messages as that red box by default
when it sits inside `<Surface series="accent">`; pass `variant="text"` to keep
plain text there. In the default theme's dark mode the box uses dark text
instead of white, which read at 3.85:1 on the brightened red there and now
reads at 5.06:1; every other theme draws it as before. A new `useSurfaceSeries`
hook, exported from `@codaco/fresco-ui/layout/Surface`, tells a component
whether it is inside an accent or a default Surface.

Destructive text across the library, such as required-field markers, inline
error lines and the weak password label, now uses `text-destructive-ink` rather
than `text-destructive`, so an accent Surface can give it a legible colour
without changing destructive buttons and badges. `getPasswordStrength` returns
`'text-destructive-ink'` as the `colorClass` of a weak password, and the
`PasswordStrength['colorClass']` type changes to match.
