---
'@codaco/documentation': patch
---

The two DOI links on "Citing the Software" now resolve.

Both were written as `https://doi:10.xxxx/…` rather than `https://doi.org/10.xxxx/…`.
That address cannot be parsed as a URL — the part after `https://` reads as a
host named `doi` on port `10` — so the Network Science citation link went
nowhere and threw an error when the page tried to prefetch it, and the Social
Networks citation displayed an address no reader could follow. Both now point at
doi.org, matching the other citations on the page.
