ALTER TABLE "travelers" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_receipt" varchar(100);--> statement-breakpoint
ALTER TABLE "favorites" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;--> statement-breakpoint
-- HAND-EDITED: the ADD COLUMN above fills every existing row with the
-- DEFAULT tenant. That is wrong for any row whose owner belongs to another
-- tenant, so set each row's tenant from the user who owns it. Without this,
-- a second tenant's travelers/favorites would be re-homed into the default
-- tenant (and, once RLS is on, vanish from their real tenant).
UPDATE "travelers" t SET "tenant_id" = u."tenant_id" FROM "users" u WHERE u."id" = t."owner_user_id" AND t."tenant_id" <> u."tenant_id";--> statement-breakpoint
UPDATE "favorites" f SET "tenant_id" = u."tenant_id" FROM "users" u WHERE u."id" = f."user_id" AND f."tenant_id" <> u."tenant_id";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "travelers" ADD CONSTRAINT "travelers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "favorites" ADD CONSTRAINT "favorites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "travelers_tenant_idx" ON "travelers" USING btree ("tenant_id");