# Segmented Toolbar Colored Hover Design

## Problem

`SegmentedToolbar` always renders its internal Fresco `Button` with the `text`
variant. That variant applies the neutral component color on hover. Toolbar
segments that supply a filled color through `className`, including Architect's
Download and Finished Editing actions, therefore turn platinum on hover instead
of retaining their intended sea-green treatment.

## Design

Expose an optional Fresco Button variant on `SegmentContent`. The segmented
toolbar will continue to default to the `text` variant, preserving every
existing unfilled toolbar control. A segment may opt into `default` when it is
visually filled.

Architect's Download and Finished Editing segments will use `variant: 'default'`
with their existing `bg-sea-green text-white` token classes. The shared
SegmentedToolbar color examples will also mark filled segments as `default`, so
the documented usage demonstrates the correct behavior. No global Button
variants or theme tokens will change.

## Compatibility and Accessibility

The change only forwards a visual Button variant. Segment labels, icons,
handlers, disabled state, roving focus, tooltips, orientation, and keyboard
behavior remain unchanged. Existing consumers that omit the new property retain
the current text-button rendering.

## Testing

Extend the SegmentedToolbar color regression test first. It will assert that a
filled segment opting into the default variant keeps its supplied background
and foreground classes and does not receive the text variant's neutral hover
class. The test must fail before the implementation and pass afterward.

Run the focused SegmentedToolbar and Architect navigation tests, then the
repository formatter, auto-fixing linter, typecheck, `knip`, and relevant app
tests. Perform a browser hover check in Architect to confirm that Download and
Finished Editing retain sea green on hover.

## Release Notes

This is visible in both the published Fresco UI package and the Architect app,
so the pull request will carry separate patch changesets for
`@codaco/fresco-ui` and `@codaco/architect`. The library and app entries must be
separate files because the repository uses distinct release lanes.
