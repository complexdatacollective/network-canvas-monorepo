---
'@codaco/studio-server': patch
---

The web process and the worker print a refusal to start as the one sentence to
act on, as `migrate`, `maintenance` and `rotate-secrets` already did, and still
exit 1. This keeps the promise stage 1's changeset made ("boot failures still
print a plain message"): a keyring that cannot read the database, a database
with no Studio schema, a worker with no database, or an environment Studio
refuses (for example both `STUDIO_SECRETS_KEY` and `STUDIO_SECRETS_KEY_FILE`
set) no longer arrive wrapped in Effect's `ERROR (#1): <Tag>: …` report with a
stack trace.

A failure that is not a refusal, where something broke rather than refused,
still prints its stack, in every Studio process. The one-shot commands used to
print only its message.
