---
'@codaco/art': patch
---

`NetworkWeaveBackground` and `PageBackground` no longer repaint the whole background for every frame of their motion. The ribbons are painted once, in a layer of their own. The signals that travel along them are now separate elements moved only by `transform`, in steps of about a pixel thirty times a second, and the dots on the tributaries are redrawn alone, a few times a second, and only while they are on screen. A page showing the background used about half a processor core while idle; it now uses a small fraction of that. The background looks the same. Its root element is now a `div` holding the drawing, rather than the `svg` itself.
