---
'@codaco/architect': minor
'@codaco/interviewer': minor
---

Let researchers choose where an interview continues when a stage is skipped:
the next available stage, a specific later stage, or the interview finish
screen.
Architect now shows these routes in the timeline and protocol summary and
protects referenced destinations from invalid deletion or reordering.
Preview only applies its one-stage skip override when routing could actually
make the selected stage unavailable.
The bundled Mental Health Networks and Transnational Networks templates now
collect explicit consent and route declined consent to the finish screen.

Interviewer follows the live route as answers change, keeps unavailable screens
from flashing during recovery, and allows a skipped or bypassed screen to be
opened once after confirmation.
