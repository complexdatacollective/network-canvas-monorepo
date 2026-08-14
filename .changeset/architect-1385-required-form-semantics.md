---
'@codaco/fresco-ui': minor
'@codaco/interview': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
---

Required questions now agree with what they show, and a blocked submission takes the participant straight to the question that blocked it.

**A required yes/no question is no longer a switch.** A switch can only be on or off — there is no "not answered yet" — so a required yes/no question showed a definite "No" while still refusing to let the participant continue, and the only way past it was to switch it on and off again. Wherever a yes/no question is required, it now asks with a pair of Yes/No choices that genuinely start unselected. This applies to protocols already in use, as soon as they are loaded: no re-saving in Architect, no protocol change, and the answers recorded are the same true/false they always were. Researchers running a study that uses a required yes/no toggle will see this change on screen mid-flight.

**A required scale no longer sounds answered.** Its handle has to rest somewhere, so a screen reader was told "50%" before anything had been chosen. It now announces that no value has been chosen yet, matching the muted resting handle a sighted participant already saw. Choosing the middle of the scale deliberately still records it, exactly as before.

**A blocked submission now moves to the first unanswered question immediately**, and to the one that is genuinely first on the screen rather than whichever the form happened to register first. Previously focus was left on the page body for up to two seconds, and sometimes never arrived at all — the participant was told something was wrong with no way to find it except by hunting. This applies everywhere a form is submitted, in the interview and in Architect's own editors.

**Error messages no longer name the researcher's variables to participants.** A question compared against another answer used to read "Your answer must be greater than the value of 'runtimeNumber'." It now uses the question the participant was actually asked — "Your answer must be greater than your answer to 'How many years have you lived here?'" — or, where that question was answered on an earlier screen, a plain sentence with no name in it at all.

**An unanswered question now shows one message, not two.** Leaving a question blank produced both "You must answer this question before continuing." and a second complaint about a comparison it could not make. Comparison rules now wait until both answers exist, so a blank comparison target no longer produces a nonsensical error either.

**Scroll guidance no longer covers the questions it is about.** The "Scroll to see more questions" callout floated over the bottom of the form and hid whatever was there — a question, an option, or an inline error — most visibly on a phone. It now sits below the questions rather than on top of them, and steps aside entirely while any question is showing an error.

Also fixed: every field described itself to screen readers using references to a required marker and a hint even when it had neither, and a field's error message could arrive too late to be announced at all.
