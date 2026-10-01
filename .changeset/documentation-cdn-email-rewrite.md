---
'@codaco/documentation': patch
---

Several documentation pages no longer arrive without their interactive
behaviour.

The CDN in front of the site rewrites any email address it finds in a page into
a placeholder link, so that address crawlers cannot read it. Seven pages carry
one — the Fresco Advanced Deployment example's `ACME_EMAIL` line, the Neon
connection strings in the Fresco guide, the support address in three FAQ pages
and on the not-found page — and on each of them the rewritten text no longer
matched the page the site itself had rendered. The browser reported the
disagreement and kept the plain server text: no sidebar, no search, no code-copy
buttons, and on the Advanced Deployment page the environment example read
`[email protected]` instead of the address it documents.

The built pages now ask the CDN to leave those addresses alone, which restores
the page behaviour and prints the example addresses as written. It costs nothing
in crawler protection: a `mailto:` link carries its address in an attribute,
which the CDN never rewrote, so the addresses the site publishes were always
served in the clear.
