---
'@codaco/architect': minor
'@codaco/interviewer': minor
'@codaco/shared-consts': minor
---

Architect can now send a protocol straight to Interviewer.

**Architect**

- A new **Send to Interviewer** button sits beside **Download**. It opens
  Interviewer in a new tab and passes it the protocol, bundled exactly as
  Download would save it. The production site sends to
  interviewer.networkcanvas.com; the development site and its previews send to
  interviewer.networkcanvas.dev.
- If the protocol cannot be bundled (a resource cannot be read, or the finish
  stage has no text), the new tab closes again and the same explanation as for
  Download is shown. If Interviewer does not receive the protocol, for example
  because the browser blocked the new tab, a dialog suggests downloading the
  protocol and opening the file in Interviewer instead.

**Interviewer**

- When Architect opens it, Interviewer accepts the protocol Architect passes
  and imports it once Interviewer is unlocked (or set up, on first use). It
  only accepts protocols from Architect's own sites.

**Shared constants (`@codaco/shared-consts`)**

- Adds the message types, origin rules and helpers both apps use for this
  handoff (`parseInterviewerHandoffPayload`, `readInterviewerHandoffReply`,
  `interviewerOriginFor`, `isAllowedArchitectOrigin` and related exports).
