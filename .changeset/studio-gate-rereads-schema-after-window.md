---
'@codaco/studio-api': patch
---

After maintenance mode ends or a migration releases its lock, the API and the
job worker stay closed until they have read the database schema again. Before,
a schema read that failed or was slow straight after a migration answered the
value from before it, so a process built for the old schema could reopen on
the new one. While that read keeps failing, readiness reports "the schema has
not been read since maintenance mode or a migration".
