---
'@codaco/architect': patch
'@codaco/fresco-ui': minor
---

Make the stage timeline operable from the keyboard, and stop it running off the side of narrow screens.

The timeline could only be used with a mouse. A stage card was a list item with
a click handler, so Enter and Space did nothing on it; reordering existed only
as a pointer drag; and a protocol with no stages yet had no keyboard route to
its first one, because the "Add new stage" control was not a button and never
appeared in the tab order.

Every one of those actions now works from the keyboard. Each card carries a
real control that opens the stage editor, a grip handle that moves the stage
with the up and down arrow keys — announcing where it landed, and refusing the
same moves a drag refuses, in one undo step either way — and a delete control.
The card itself still drags from anywhere and still opens when clicked, so
nothing changes for researchers working with a mouse.

The reorder and delete controls, and the insertion points between cards, used
to appear on hover alone. They now appear on focus as well, so a keyboard
researcher is no longer operating an invisible Delete. Confirming a deletion
hands focus to the neighbouring stage — or to "Add new stage" when the last one
goes — and says what was deleted and how many stages are left, rather than
dropping focus at the top of the page in silence.

The timeline also describes itself honestly now. It is a list of stages, but
every insertion point between the cards, and the "Add new stage" control at the
end, counted as members of that list — so a screen reader announced a 32-stage
protocol as a list of 65 things, and a researcher counting their way down it
was told the wrong number every time. The list holds its stages and nothing
else. Each insertion point now belongs to the stage it sits above, which is
what its own wording already said, and nothing moved in the tab order.

Widths. Timeline rows were a fixed 672px with the delete button parked 160px
outside them, which put a horizontal scrollbar on the page at tablet width and
worse on a phone. Rows are now fluid, the actions sit inside the row, and each
card's number stays exactly on the timeline's centre line at every width.

Three shared components changed with it. An array field no longer forces a
384px minimum width on whatever contains it — the sole cause of the stage
editor's sideways scroll on a phone. A segmented toolbar shrinks to its
container and scrolls its own segments rather than clipping them off the edge
of the screen, and keeps room for its focus ring while doing so. And a sortable
list's drag handle stops waiting to reclaim focus when the list refuses the
move it asked for, which otherwise stole focus later, at the next unrelated
reorder.
