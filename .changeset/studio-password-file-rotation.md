---
'@codaco/studio-api': minor
---

The database password in `DATABASE_PASSWORD_FILE` can be rotated without restarting Studio. The API and the worker reread the file whenever they open a new database connection, so once the role's password is changed in Postgres and the file holds the new one, every new connection uses it while open connections carry on. The schema and maintenance commands still read the file once, when they start.
