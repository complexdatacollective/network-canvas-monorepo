---
'@codaco/fresco-ui': patch
---

Boolean and rich-select option cards now set their own text colour alongside their background, so their labels stay readable on any surface. Previously the label inherited the surrounding surface's text colour, which could leave it unreadable — white on a white card — wherever the card sat on a dark surface.

Modal popups now finish their exit animation instead of restarting it whenever a surrounding component re-renders, which could leave a closed modal mounted on screen and covering whatever opened next.

Form values now resolve a nested field over the field that holds its container path, instead of whichever registered last winning. A form with both `mapOptions` and `mapOptions.style` registered could previously lose one of them on submit.

Submit buttons keep the same label while a form is submitting, showing progress through their spinner and disabled state instead of renaming themselves. A button that renamed itself mid-submit could make an automated check believe a dialog had already closed. Pass `submittingText` to opt back in to a changed label.

Surfaces gained a fourth nesting level, so deeply nested content has one more step of contrast before it repeats its parent's colour.

Fields no longer establish a CSS size container unless they lay out inline, which is the only layout that queries it. Making every field a size container could, in Chromium, leave a field's control with its styles but without any layout at all — rendering it invisible and unusable — when a large neighbouring section appeared at the same moment.

Adding a row to a list field now keeps the row's own identity instead of assigning it an unrelated one. The mismatch surfaced a moment later and remounted the row, and any form fields it contained were torn down with it, losing what had just been entered.

A field that is checked while part of the form appears or disappears now finishes that check instead of abandoning it. Previously the field kept whatever error it was already showing, so an answered field could go on reporting itself as required — most visibly where answering one field is what reveals the next section.
