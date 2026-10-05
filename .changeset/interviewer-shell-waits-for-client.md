---
'@codaco/interviewer': patch
---

Interview analytics now stay off until the app's own PostHog client has loaded. Previously, while that client was still loading (at unlock, or on a later opt-in), the interview runtime briefly started a second, separately configured PostHog instance of its own, which could report the first events of a session under a different identity.
