---
'@codaco/network-exporters': patch
---

Bump `@xmldom/xmldom` from 0.9.10 to 0.9.12, fixing several denial-of-service
vulnerabilities in XML parsing and serialization: quadratic-memory namespace
handling, quadratic-time duplicate-attribute de-duplication, and RAWTEXT
closing-tag output amplification, among others. `@codaco/network-exporters`
builds and serializes GraphML exports through this dependency, so npm
consumers pinned to the previous floor need this patch to pick up the fix.
