---
'@codaco/interviewer': patch
---

Interview data and protocols saved in one tab are no longer stored unencrypted when the device is secured in another tab at the same moment. A save caught mid-way is refused instead, and a protocol upgrade that was running finishes encrypted the next time the app is unlocked.
