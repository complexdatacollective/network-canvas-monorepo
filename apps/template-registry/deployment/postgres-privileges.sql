REVOKE TEMPORARY ON DATABASE registry FROM PUBLIC, registry_app, registry_operator, registry_backup, registry_runtime, registry_operations, registry_backup_login;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
/* REGISTRY_LARGE_OBJECT_PRIVILEGES */
