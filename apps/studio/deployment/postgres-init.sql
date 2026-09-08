-- PostgreSQL reads this file through psql; no executable bind mount is needed.
\getenv migrator_password STUDIO_MIGRATION_PASSWORD
\getenv runtime_password STUDIO_DATABASE_PASSWORD
\getenv maintenance_password STUDIO_MAINTENANCE_DATABASE_PASSWORD
\getenv backup_password STUDIO_BACKUP_PASSWORD
-- configure replaces this marker with the shared, validated role bootstrap.
/* STUDIO_RUNTIME_ROLES */
CREATE ROLE studio_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD :'migrator_password';
CREATE ROLE studio_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD :'runtime_password';
CREATE ROLE studio_maintenance_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD :'maintenance_password';
CREATE ROLE studio_backup_login LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD :'backup_password';
GRANT studio_app, studio_maintenance TO studio_migrator WITH SET TRUE, INHERIT FALSE;
GRANT studio_app TO studio_runtime WITH SET TRUE, INHERIT FALSE;
GRANT studio_maintenance TO studio_maintenance_runtime WITH SET TRUE, INHERIT FALSE;
GRANT studio_backup TO studio_backup_login WITH SET TRUE, INHERIT FALSE;
-- CREATE DATABASE cannot run in a transaction. No application session can
-- connect until the following ACL transaction has committed.
CREATE DATABASE studio OWNER studio_migrator ALLOW_CONNECTIONS false;
BEGIN;
REVOKE ALL ON DATABASE studio FROM PUBLIC;
REVOKE TEMPORARY ON DATABASE studio FROM PUBLIC, studio_app, studio_maintenance, studio_backup, studio_runtime, studio_maintenance_runtime, studio_backup_login;
REVOKE CONNECT ON DATABASE studio FROM studio_app, studio_maintenance, studio_backup;
GRANT CONNECT ON DATABASE studio TO studio_migrator, studio_runtime, studio_maintenance_runtime, studio_backup_login;
COMMIT;
ALTER DATABASE studio ALLOW_CONNECTIONS true;
\connect studio
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
/* STUDIO_LARGE_OBJECT_PRIVILEGES */
