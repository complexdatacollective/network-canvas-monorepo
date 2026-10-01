---
'networkcanvas.com': patch
---

The site now honours the operating-system "reduce motion" setting throughout.

Motion is off by default in the animation library the site uses, so the
preference was only respected where an individual component had been written to
ask for it. Everywhere else — section reveals, the homepage background, page
transitions — a visitor who had asked their device for less movement still got
the full animation.

The preference is now applied once, for the whole site. Content that used to
slide, travel or scale into place arrives already in position for those
visitors, while gentle fades still play, so pages stay legible rather than
appearing without any sense of progression.
