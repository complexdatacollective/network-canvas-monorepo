---
'@codaco/fresco-ui': patch
---

The text of a toast no longer runs up to its close button. A long title used to
continue underneath the button, so its last word could touch or sit behind it.
The button now has a column of its own beside the text, and the title and
description wrap before they reach it, in left-to-right and right-to-left
languages. As a result, a description that used to fill the whole width of a
toast may now wrap onto one more line.
