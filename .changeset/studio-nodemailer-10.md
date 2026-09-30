---
'@codaco/studio-server': patch
---

Upgrade nodemailer to 10.0.9. The 9.x line carried four advisories against the version the worker was sending with — a quadratic address parser that a crafted recipient list could use for denial of service, two recipient-domain validation bypasses (an RFC 5322 comment and an IDN/Punycode allow-list case), and a `resolveContent()` path that ignored the file and URL access policy — all fixed from 9.1.1 on. nodemailer 10 also ships its own type declarations, so the separate types package goes, and it applies the timeouts set beside a connection `url`, which lets the worker's SMTP transport be built the plain way again.
