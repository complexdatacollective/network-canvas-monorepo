-- Run as the database administrator after a restore, while every writer and
-- HTTP admission remains stopped. Migration only verifies these privileges;
-- the ordinary database owner cannot revoke PostgreSQL built-in function ACLs.
-- Runtime/backup identities must not gain a writable implicit pg_temp schema.
-- The schema-owning migrator retains its database-owner privileges.
REVOKE TEMPORARY ON DATABASE studio FROM PUBLIC, studio_app, studio_maintenance, studio_backup, studio_runtime, studio_maintenance_runtime, studio_backup_login;
/* STUDIO_LARGE_OBJECT_PRIVILEGES */
