---
'@codaco/documentation': patch
---

Cache fonts and other build assets in the browser, and start the fonts downloading sooner.

The site's stylesheets, scripts and fonts were served with `Cache-Control: public, max-age=0, must-revalidate`, so every page load re-checked each of them with the server before text could settle into its typeface, and pages briefly showed a fallback font. Their filenames already change whenever their contents do, so they are now cached for a year and repeat visits load them from disk.

The two fonts the site starts with are also preloaded, so they begin downloading alongside the stylesheet rather than once it has been parsed.
