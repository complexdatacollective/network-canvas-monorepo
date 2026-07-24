---
"@codaco/architect": patch
---

A scalar (visual analog scale) variable's Minimum value and Maximum value
validation rules now report an error while you edit them if only one is set, or
if the minimum is not below the maximum. These bounds become the slider's track
in the interview, so a minimum on its own paired with the default maximum of 1
and produced a scale no participant could answer. The error appears on the
validation rules themselves rather than waiting for protocol validation.
