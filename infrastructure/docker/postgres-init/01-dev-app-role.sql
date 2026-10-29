-- DEVELOPMENT ONLY. Creates the low-privilege role the API connects as, with
-- a throwaway password, so `docker compose up` exercises row-level security
-- exactly like production does (RLS does not apply to the `postgres`
-- superuser). Migration 0002 grants this role its table privileges and
-- creates the policies. In production, do NOT use this file: let the
-- migration create the role NOLOGIN and set the password out-of-band with
-- `pnpm --filter @travel/database db:setup-app-role`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app') THEN
    CREATE ROLE travel_app LOGIN PASSWORD 'travel_app_dev_password'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
