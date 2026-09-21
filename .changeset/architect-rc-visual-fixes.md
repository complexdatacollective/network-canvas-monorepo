---
'@codaco/architect': patch
'@codaco/fresco-ui': minor
'@codaco/background-creator': patch
---

A long attribute name no longer pushes the rest of the codebook table off
screen. The name is cut short with an ellipsis, and the full name is still in
its tooltip.

The printed protocol summary shows stored values exactly as they are saved,
instead of breaking them across lines with hyphens. The summary page also has
the same margin at the edges as the Codebook and Resource Library pages.

On a phone, the list of interfaces for a new stage now fits the screen, and
every title and description can be read.

A video preview keeps its playback controls inside the window.

While you edit a choice value, its confirm button is now the same size as the
delete button beside it.

When a toolbar is too narrow for all its buttons, it now fades the edge where
more buttons are hidden, so it is clear the toolbar can be scrolled. This
includes the Background Creator toolbar. The toolbar at the bottom of
Architect's screen also scrolls to show its last button, such as Download.

`SegmentedToolbar` has a new `restAt` prop. Set it to `"end"` to show a
toolbar's last button, rather than its first, when the toolbar does not fit.

A field's error message now has space between it and the control above it,
instead of sitting right against it.

`ScrollArea` now fades the correct edges when it scrolls sideways in a
right-to-left language.
