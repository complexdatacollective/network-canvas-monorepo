-- The signed installer substitutes the shared role bootstrap at this marker.
\getenv migrator_password REGISTRY_MIGRATION_PASSWORD
\getenv runtime_password REGISTRY_DATABASE_PASSWORD
\getenv operator_password REGISTRY_OPERATOR_PASSWORD
\getenv backup_password REGISTRY_BACKUP_PASSWORD
/* REGISTRY_RUNTIME_ROLES */
CREATE ROLE registry_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD :'migrator_password';
CREATE ROLE registry_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD :'runtime_password';
CREATE ROLE registry_operations LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD :'operator_password';
CREATE ROLE registry_backup_login LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD :'backup_password';
GRANT registry_app TO registry_runtime WITH SET TRUE, INHERIT FALSE;
GRANT registry_operator TO registry_operations WITH SET TRUE, INHERIT FALSE;
GRANT registry_backup TO registry_backup_login WITH SET TRUE, INHERIT FALSE;
CREATE DATABASE registry OWNER registry_migrator ALLOW_CONNECTIONS false;
BEGIN;
REVOKE ALL ON DATABASE registry FROM PUBLIC;
REVOKE TEMPORARY ON DATABASE registry FROM registry_app, registry_operator, registry_backup, registry_runtime, registry_operations, registry_backup_login;
REVOKE CONNECT ON DATABASE registry FROM registry_app, registry_operator, registry_backup;
GRANT CONNECT ON DATABASE registry TO registry_migrator, registry_runtime, registry_operations, registry_backup_login;
COMMIT;
ALTER DATABASE registry ALLOW_CONNECTIONS true;
\connect registry
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
/* REGISTRY_LARGE_OBJECT_PRIVILEGES */
