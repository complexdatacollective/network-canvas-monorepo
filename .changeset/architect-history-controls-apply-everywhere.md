---
'@codaco/architect': patch
---

Undo and Redo now take effect wherever you press them. Previously, if the change you were taking back had been made on a different page, the first press only moved you to that page and left the change in place — you had to press the same control again to actually undo it, and Redo stayed unavailable in between. One press now performs one step of history from any page.

Architect still brings you to the page that shows the result, but does so in the same press rather than a separate one, and now says what happened for screen reader users. It no longer moves you at all when no page would show the change any better than the one you are already on.

Undo and Redo are also available on the Summary page, which previously offered no way to take back a change. Because the summary already shows the whole protocol, taking a change back there updates the report where you are reading it rather than moving you elsewhere. Summary remains a read-only report in every other respect.

History controls now use the same dedicated toolbar at the bottom left of both
the timeline and stage editor. The toolbar appears only while Undo or Redo is
possible, keeps the unavailable direction disabled, and separates the two
actions so they are easier to distinguish from the page actions at bottom
right.

If you had learned to press Undo twice, note that two presses now take back two changes.
