---
'@codaco/fresco-ui': patch
---

Every subpath that runs a React hook now declares `'use client'`, so a Next App
Router application can import it from a Server Component. Twenty-seven modules
were missing the directive, including `Modal`, `Popover`, `TimeAgo`,
`SegmentedSwitcher`, `form/FieldGroup`, `form/SubmitButton`,
`form/fields/CheckboxGroup`, the form hooks (`form/hooks/useField`,
`useForm`, `useFormState`, `useFormStore`, `useFormValue`), `dialogs/useDialog`,
`dnd/useDropTarget`, `hooks/useSafeLocalStorage`, `navigation/RouteFocus` and
`utils/NoSSRWrapper`. An unmarked module is treated as server code, so importing
any of these anywhere in a Server Component's import graph failed the build
rather than rendering.

`typography/Heading` and `NativeLink` are deliberately unchanged and stay
server-renderable: the only hook-named call they make is Base UI's `useRender`,
which runs no React hook of its own.
