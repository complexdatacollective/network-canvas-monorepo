---
'@codaco/documentation': patch
---

The Fresco FAQ for IT departments' network-restriction mitigation now discloses a real gap: Next.js dispatches Server Actions by a request header rather than by URL, so a signed-in researcher's session cookie can still authorize an action (export, deletion, settings changes) through a path the guidance leaves public. Closing this requires app-level enforcement that does not exist yet; the section now says so plainly rather than implying the path split is a complete boundary.
