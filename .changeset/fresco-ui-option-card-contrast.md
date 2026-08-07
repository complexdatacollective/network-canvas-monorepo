---
'@codaco/fresco-ui': patch
---

Boolean and rich-select option cards now set their own text colour alongside their background, so their labels stay readable on any surface. Previously the label inherited the surrounding surface's text colour, which could leave it unreadable — white on a white card — wherever the card sat on a dark surface.

Modal popups now finish their exit animation instead of restarting it whenever a surrounding component re-renders, which could leave a closed modal mounted on screen and covering whatever opened next.

Form values now resolve a nested field over the field that holds its container path, instead of whichever registered last winning. A form with both `mapOptions` and `mapOptions.style` registered could previously lose one of them on submit.
