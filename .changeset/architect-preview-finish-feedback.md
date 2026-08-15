---
'@codaco/architect': patch
---

Finishing an interview in Preview now tells you it finished, and offers you somewhere to go next.

**Confirming Finish Interview was a visible no-op.** The confirmation closed back onto the identical Finish screen: no message, no change, nothing to say the interview had ended — and Finish was still there to be confirmed again, as many times as you liked. Preview handed the interview runtime a finish handler that did nothing, so the one moment a participant's interview ends was the one moment Preview showed you nothing at all.

Preview now replaces the interview with a **Preview finished** screen, exactly as the apps a participant uses replace it with their own completion screen — so what you see at the end of a preview matches the shape of what a participant sees at the end of a real interview. The screen says plainly that nothing was saved, and offers **Start the preview again** alongside **Close tab**. Starting again begins a completely fresh run at the stage you previewed from, exactly as if you had launched the preview a second time. Because the preview window was handed its copy of the protocol when it opened, that run uses the protocol as it was at that moment, and the screen says so — to try out edits you have made in Architect since, start a new preview from Architect.

**The confirmation now says what finishing a preview actually costs.** It used to borrow the participant wording — "Finish this interview only when you are satisfied with your responses" — which promises a permanence a preview never had. It now tells you that nothing is saved and that finishing ends this run, so giving up a preview you have spent time clicking through is a choice you make with the consequence in front of you. Cancel still leaves the interview untouched.

Screen-reader users are moved to the completion heading when it appears, and hear what happened to the responses along with it — previously the interview simply vanished from under the button you had just activated, leaving focus on nothing.
