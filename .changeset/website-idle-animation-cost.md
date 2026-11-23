---
'networkcanvas.com': patch
---

The website uses far less of your computer's processor and graphics card while a page is open. Its moving background was being redrawn in full for every frame, on every page that shows it, for as long as the tab was visible; it is now drawn once, and only its moving parts are updated. The news ticker on the homepage, the illustrations on the Updates page and the animated title on the Summer 2026 update page also do less work, and stop altogether once they are scrolled out of view. Everything looks and moves as it did. Measured on a 120Hz display, an idle homepage went from about three quarters of a processor core to between a sixth and a third.
