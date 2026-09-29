---
'@codaco/studio-server': patch
---

The stored-secret check and `rotate-secrets` run as Effects over the process's
own keyring and cipher (stage 6 of the Effect 4 migration, #1927). What a
deployment sees:

- The web process, the worker, `migrate` and `apply-schema` refuse a database
  whose stored secrets the keyring cannot open on the same three conditions, in
  the same order, as before. The web process and the worker run the check as a
  gate beneath the listener and the job queue, on a maintenance connection that
  is closed before either starts.
- `rotate-secrets` logs each committed batch as a JSON line, like every other
  Studio log, rather than as a plain line. Its closing summary and exit codes
  are unchanged: 0 when every row is under the current entry, 1 when it
  refuses or could not prove every row rotated, 130 when interrupted, with
  every committed batch kept.
- `migrate`, `maintenance` and `rotate-secrets` now print why they refused an
  environment they could not read (for example both `STUDIO_SECRETS_KEY` and
  `STUDIO_SECRETS_KEY_FILE` set). They exited 1 in silence before.
