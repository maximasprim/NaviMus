ALTER TABLE "notification_logs" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;--> statement-breakpoint
-- HAND-EDITED: ADD COLUMN fills existing rows with the DEFAULT tenant. Rows
-- that have a user belong to that user's tenant. Guest rows (no user) carry no
-- tenant information anywhere, so they stay with the default tenant - a
-- documented limitation of data written before this column existed.
UPDATE "notification_logs" n SET "tenant_id" = u."tenant_id" FROM "users" u WHERE u."id" = n."user_id" AND n."tenant_id" <> u."tenant_id";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_logs_tenant_idx" ON "notification_logs" USING btree ("tenant_id");
--> statement-breakpoint
-- Replace the parent-inherited policy from 0002 (which could not see guest
-- rows, making INSERT ... RETURNING fail for them) with a direct one.
DROP POLICY IF EXISTS tenant_isolation ON notification_logs;--> statement-breakpoint
CREATE POLICY tenant_isolation ON notification_logs
  USING (app_rls_bypass() OR tenant_id = app_current_tenant())
  WITH CHECK (app_rls_bypass() OR tenant_id = app_current_tenant());
