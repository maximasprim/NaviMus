-- Row-level security: tenant isolation enforced by Postgres itself, as a
-- second layer under the application-layer scoping (withTenant etc.).
--
-- HOW IT IS DRIVEN: the API gateway opens one transaction per request and
-- sets `app.current_tenant_id` (transaction-local) before any handler runs;
-- platform/system paths set `app.bypass_tenant_rls` instead. See
-- packages/database/src/rls-context.ts. Nothing here reads anything else.
--
-- WHO IT APPLIES TO: RLS does NOT apply to superusers, to roles with
-- BYPASSRLS (Supabase's default `postgres` role has it), or to a table's
-- owner. So these policies only protect you if the application connects as
-- the dedicated `travel_app` role created below - NOT as the role that runs
-- migrations. The gateway checks this at boot (checkRlsEnforcement) and
-- refuses to start in production if it isn't true. See docs/RLS.md.

-- ---------------------------------------------------------------- helpers
CREATE OR REPLACE FUNCTION app_rls_bypass() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.bypass_tenant_rls', true), ''), 'false') = 'true'
$$;--> statement-breakpoint

-- NULL when unset: `tenant_id = NULL` is never true, so a session that never
-- declared a tenant sees nothing (rather than erroring, or seeing everything).
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
$$;--> statement-breakpoint

-- ------------------------------------- tables that carry their own tenant_id
DO $$
DECLARE
  tbl text;
  direct_tables text[] := ARRAY[
    'users', 'operators', 'destination_categories', 'destinations',
    'accommodations', 'transport_providers', 'vehicle_types',
    'transfer_locations', 'airport_transfers', 'packages', 'bookings',
    'payments', 'reviews', 'coupons', 'promotions',
    'notification_templates', 'invoices', 'receipts',
    'cancellation_policies', 'travelers', 'favorites',
    -- nullable tenant_id: platform-level rows (NULL) are hidden from tenant
    -- sessions and visible only in bypass mode, with no special case needed.
    -- (system_settings is handled separately below: its NULL rows are
    -- platform DEFAULTS that tenants must be able to read.)
    'audit_logs'
  ];
BEGIN
  FOREACH tbl IN ARRAY direct_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (app_rls_bypass() OR tenant_id = app_current_tenant())
         WITH CHECK (app_rls_bypass() OR tenant_id = app_current_tenant())',
      tbl
    );
  END LOOP;
END $$;--> statement-breakpoint

-- ----------------------------------- child tables: visibility follows parent
-- These tables have no tenant_id; each has a foreign key to a tenant-scoped
-- parent. The policy is "you may see/write this row iff you may see its
-- parent". The EXISTS subquery is itself subject to the parent's policy, so
-- this composes through multi-level chains (rooms -> room_types ->
-- accommodations) without any extra columns or backfill.
-- Entry format: child|fk_column|parent_table
DO $$
DECLARE
  entry text;
  parts text[];
  child_tables text[] := ARRAY[
    'booking_cancellations|booking_id|bookings',
    'booking_items|booking_id|bookings',
    'booking_status_history|booking_id|bookings',
    'booking_travelers|booking_id|bookings',
    'ledger_entries|booking_id|bookings',
    -- booking_id here is nullable and has no FK constraint; a row with no
    -- booking is an orphan and is visible only in bypass mode.
    'accommodation_bookings|booking_id|bookings',
    'transfer_bookings|booking_id|bookings',
    'transport_bookings|booking_id|bookings',
    'cancellation_rules|policy_id|cancellation_policies',
    'destination_activities|destination_id|destinations',
    'destination_amenities|destination_id|destinations',
    'destination_images|destination_id|destinations',
    'destination_videos|destination_id|destinations',
    'discounts|promotion_id|promotions',
    'email_verification_tokens|user_id|users',
    'password_reset_tokens|user_id|users',
    'user_roles|user_id|users',
    'operator_documents|operator_id|operators',
    'operator_services|operator_id|operators',
    'operator_users|operator_id|operators',
    'package_accommodation_options|package_id|packages',
    'package_activities|package_id|packages',
    'package_availability|package_id|packages',
    'package_capacity|package_id|packages',
    'package_destinations|package_id|packages',
    'package_exclusions|package_id|packages',
    'package_inclusions|package_id|packages',
    'package_itineraries|package_id|packages',
    'package_prices|package_id|packages',
    'package_transport_options|package_id|packages',
    'payment_refunds|payment_id|payments',
    'payment_transactions|payment_id|payments',
    'review_images|review_id|reviews',
    'room_types|accommodation_id|accommodations',
    'rooms|room_type_id|room_types',
    'support_tickets|user_id|users',
    'support_messages|ticket_id|support_tickets',
    'transport_routes|transport_provider_id|transport_providers',
    'vehicles|transport_provider_id|transport_providers'
  ];
BEGIN
  FOREACH entry IN ARRAY child_tables LOOP
    parts := string_to_array(entry, '|');
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', parts[1]);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', parts[1]);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %1$I
         USING (app_rls_bypass() OR EXISTS (SELECT 1 FROM %3$I p WHERE p.id = %1$I.%2$I))
         WITH CHECK (app_rls_bypass() OR EXISTS (SELECT 1 FROM %3$I p WHERE p.id = %1$I.%2$I))',
      parts[1], parts[2], parts[3]
    );
  END LOOP;
END $$;--> statement-breakpoint

-- system_settings: rows with tenant_id NULL are platform-wide DEFAULTS (e.g.
-- the platform commission %, default reminder offsets) which tenant code reads
-- as a fallback when the tenant has no override. So every tenant may READ them
-- (plus its own rows), but only its own rows - or bypass - may be written.
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON system_settings;--> statement-breakpoint
DROP POLICY IF EXISTS system_settings_read ON system_settings;--> statement-breakpoint
DROP POLICY IF EXISTS system_settings_write ON system_settings;--> statement-breakpoint
CREATE POLICY system_settings_read ON system_settings FOR SELECT
  USING (app_rls_bypass() OR tenant_id IS NULL OR tenant_id = app_current_tenant());--> statement-breakpoint
CREATE POLICY system_settings_write ON system_settings
  USING (app_rls_bypass() OR tenant_id = app_current_tenant())
  WITH CHECK (app_rls_bypass() OR tenant_id = app_current_tenant());--> statement-breakpoint

-- notification_logs: interim parent-derived policy. Superseded in 0003, which
-- gives the table its own tenant_id (guest rows have no user to inherit from).
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON notification_logs;--> statement-breakpoint
CREATE POLICY tenant_isolation ON notification_logs
  USING (app_rls_bypass() OR EXISTS (SELECT 1 FROM users p WHERE p.id = notification_logs.user_id))
  WITH CHECK (
    app_rls_bypass()
    OR notification_logs.user_id IS NULL
    OR EXISTS (SELECT 1 FROM users p WHERE p.id = notification_logs.user_id)
  );--> statement-breakpoint

-- --------------------------------------------------------------- tenants
-- Deliberately NOT fully locked down: the gateway must look a tenant up by
-- slug/domain BEFORE any tenant context exists, and signup/domain-resolution
-- are anonymous. So reads are open; WRITES are restricted to the tenant's own
-- row (or bypass), which stops a tenant-scoped bug from suspending, re-planning
-- or re-pointing a different tenant.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenants_read ON tenants;--> statement-breakpoint
DROP POLICY IF EXISTS tenants_write_self_or_bypass ON tenants;--> statement-breakpoint
CREATE POLICY tenants_read ON tenants FOR SELECT USING (true);--> statement-breakpoint
CREATE POLICY tenants_write_self_or_bypass ON tenants
  USING (app_rls_bypass() OR id = app_current_tenant())
  WITH CHECK (app_rls_bypass() OR id = app_current_tenant());--> statement-breakpoint

-- Not covered, on purpose (no tenant dimension, or must be reachable before a
-- tenant is known): plans, permissions, roles, role_permissions, countries,
-- regions, cities (shared reference data); payment_webhooks (provider-level
-- dedup, looked up before the tenant is known); search_logs (anonymous
-- analytics rows with no tenant link).

-- ------------------------------------------------------- application role
-- The role the API connects as. NOLOGIN here so no password lives in a
-- migration: set one out-of-band, e.g.
--   ALTER ROLE travel_app LOGIN PASSWORD '<from your secret manager>';
-- and point DATABASE_URL at it. Migrations keep running as the owner role
-- (DATABASE_MIGRATION_URL).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app') THEN
    CREATE ROLE travel_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO travel_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO travel_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO travel_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO travel_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO travel_app;
