# @codaco/protocol-review-worker

## 0.1.0

### Minor Changes

- First release of the service behind Architect's experimental Automated Protocol Review, deployed at `protocol-review.networkcanvas.com`.

  The researcher chooses who writes each review: Anthropic (Claude Opus 5.5) or OpenAI (GPT-6.1 Sol). Each provider has its own budget of at most US $200 in a calendar month and US $20 in a day, so one that is spent leaves the other available. `GET /providers` says which have room, and a review of a provider whose budget is spent is refused with `daily_limit` or `monthly_limit` and the time it starts again.
