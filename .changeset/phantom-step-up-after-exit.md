---
'@codaco/interviewer': patch
---

Fixed a stray "Confirm your identity" dialog that appeared over the Home screen after exiting an interview when a PIN, passphrase, or biometric is enrolled and "Require unlock when entering an interview" is enabled. The dialog could not be satisfied, blocked part of the screen, and wrongly offered the destructive "Recover by resetting" option.
