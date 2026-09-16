---
'networkcanvas.com': patch
---

Cache fonts and other build assets in the browser, and start the fonts downloading sooner.

The site's stylesheets, scripts and fonts were served with `Cache-Control: public, max-age=0, must-revalidate`, so every page load re-checked each of them with the server even though their filenames already change whenever their contents do. They are now cached for a year, and a repeat visit or an onward navigation loads them from disk instead of the network.

The two fonts the site starts with are also preloaded, so they begin downloading alongside the stylesheet rather than only once it has been parsed. Together this removes the delay before text settles into its final typeface.
