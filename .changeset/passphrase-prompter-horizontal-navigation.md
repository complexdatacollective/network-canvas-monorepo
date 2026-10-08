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
button now sits next to the settings button in the bottom bar and can be
reached with the keyboard. Screen readers announce why the passphrase is
needed, once, and the explanation that appears beside the button stays on
screen on narrow phones.

The navigation buttons also stay on screen on small phones at every text size.
Before, a larger text size could push the forward button past the edge of the
screen, and on a small phone held sideways the side navigation could lose it
even at the default size. When space is short the buttons now shrink together,
down to a comfortable size for a finger to tap.
