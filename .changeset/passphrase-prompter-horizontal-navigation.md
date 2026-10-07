---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Participants can now enter a passphrase when the interview's navigation runs
along the bottom of the screen, as it does on phones and other portrait
screens. Before this fix, the passphrase button only appeared in the side
navigation, so on a portrait screen a participant in an interview with
encrypted names could not add people on stages that needed the passphrase. The
button now sits next to the settings button in the bottom bar, fits on small
phones, and can be reached with the keyboard. Screen readers also announce why
the passphrase is needed.
