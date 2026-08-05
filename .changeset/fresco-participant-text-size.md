---
'fresco': minor
---

Participants can now adjust the interview's text size. The interview navigation
carries a settings menu with a "Text size" control offering 90%–130% of the
default size, scaling text, spacing, and touch targets together. The change
previews live while the menu is open and lasts for the rest of the session. The
control is fully keyboard operable and announces its state to screen readers.

This release also picks up the latest Network Canvas interview and interface
updates:

- Tablets render the interview at its full text size again. Every viewport
  narrower than 1280px had been rendering below the intended base size, which
  also shrank spacing and touch targets. Editable fields never render below 16px
  now either, so focusing one no longer makes iOS Safari zoom the page.
- Nodes stay fully visible when moved to the edge of the Sociogram, Narrative,
  and Network Composer canvases, instead of being partially cut off on wide
  displays.
- A scrolled roster stays where it was after an item is dragged out of it,
  rather than jumping back to the top.
- Exporting large interviews no longer stalls the progress display, and
  cancelling an export releases the partially built archive immediately.
- Timestamps in the dashboard's tables render immediately instead of appearing a
  moment after the row, so selecting a row no longer makes them flicker.
- Unchecked options in dropdown menus no longer show a check indicator.
