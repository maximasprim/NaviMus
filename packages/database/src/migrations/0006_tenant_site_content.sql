CREATE TABLE IF NOT EXISTS "tenant_site_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_site_content" ADD CONSTRAINT "tenant_site_content_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_site_content" ADD CONSTRAINT "tenant_site_content_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_site_content_tenant_unique" ON "tenant_site_content" USING btree ("tenant_id");--> statement-breakpoint
-- HAND-ADDED (drizzle-kit does not emit RLS): the same tenant_isolation policy every other tenant-owned
-- table gets in 0002_row_level_security.sql. The app role (travel_app) already has table privileges through
-- the ALTER DEFAULT PRIVILEGES set up in 0002, so no GRANT is needed here.
ALTER TABLE "tenant_site_content" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "tenant_site_content";
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tenant_site_content"
  USING (app_rls_bypass() OR tenant_id = app_current_tenant())
  WITH CHECK (app_rls_bypass() OR tenant_id = app_current_tenant());
