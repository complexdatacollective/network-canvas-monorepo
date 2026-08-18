---
'@codaco/fresco-ui': patch
'@codaco/architect': patch
'@codaco/interview': patch
---

A crowded floating toolbar scrolls its segments again instead of squashing
them.

The toolbar was given a horizontal scroll lane so a narrow screen could reach
every action rather than have the last ones clipped off the edge. A later fix
stopped buttons in general from forcing their container to overflow — which is
what a long researcher-authored label used to do to a dialog's actions — and
that took away the very thing the scroll lane depended on. With nothing holding
its width, each segment shrank to fit instead, so the lane never had anything
to scroll: on a phone the actions silently narrowed, and an icon-only action
stopped being square, shrinking the target under the finger.

Toolbar segments now hold their size, and the lane scrolls as intended.
Wherever a toolbar already fits its space nothing changes at all — the
rendering is identical to the pixel.

Disabled toolbar actions now also carry the same faded, not-allowed treatment
as disabled buttons elsewhere, while retaining the toolbar's accessible focus
and disabled semantics.
