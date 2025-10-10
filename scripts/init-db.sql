-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create a dedicated role for the platform application (if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'fresco_platform_app') THEN
    CREATE ROLE fresco_platform_app WITH LOGIN PASSWORD 'localdev';
  END IF;
END
$$;

-- Grant database privileges
GRANT ALL PRIVILEGES ON DATABASE fresco_platform TO fresco_platform_app;

-- Ensure the platform user can create schemas for tenants
GRANT CREATE ON DATABASE fresco_platform TO fresco_platform_app;

-- Grant all privileges for public schema to the platform user
GRANT ALL ON SCHEMA public TO fresco_platform_app;
GRANT CREATE ON SCHEMA public TO fresco_platform_app;

-- Grant privileges on all current tables, sequences, and functions in public schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fresco_platform_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fresco_platform_app;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO fresco_platform_app;

-- Set default privileges for future objects in public schema
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO fresco_platform_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO fresco_platform_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO fresco_platform_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TYPES TO fresco_platform_app;

-- Make fresco_platform_app the owner of the public schema
ALTER SCHEMA public OWNER TO fresco_platform_app;