---
'networkcanvas.com': patch
---

The site now honours the operating-system "reduce motion" setting throughout.

Motion is off by default in the animation library the site uses, so the
preference reached only those components that had been written to ask for it
individually. The homepage background, the hero intro, the publication rail and
the Summer Update visuals all did ask, and were already correct. Everywhere
else — the site header, the hero, the grants section, the Summer Update's
entrance sequence, and every animated dialog, menu and overlay from the shared
component library — a visitor who had asked their device for less movement
still got the full animation.

The preference is now applied once, for the whole site. Content that used to
slide, travel or scale into place arrives already in position for those
visitors, while gentle fades still play, so pages stay legible rather than
appearing without any sense of progression.
