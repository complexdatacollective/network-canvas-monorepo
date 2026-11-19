---
'@codaco/documentation': patch
---

The documentation site uses far less of your computer's processor and graphics card while a page is open. Its moving background was being redrawn in full for every frame, for as long as the tab was visible; it is now drawn once, and only its moving parts are updated. The background looks and moves as it did.
