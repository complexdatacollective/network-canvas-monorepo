---
'@codaco/protocol-review-worker': minor
---

Reviews by OpenAI's model now use medium reasoning effort, so they finish well inside the time a review is allowed. Progress events now also count the model's thinking (`thinking`, alongside `received`), so a review can be seen to move before the answer begins.
