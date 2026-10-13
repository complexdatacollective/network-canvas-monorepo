---
'@codaco/interviewer': patch
---

Interview data and protocols saved in one tab are never stored unencrypted after the device is secured in another tab. A save caught mid-way by the device being secured is refused with a message asking you to unlock, and a protocol upgrade that was running finishes encrypted the next time the app is unlocked.
