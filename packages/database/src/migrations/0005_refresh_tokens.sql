CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"family" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_expires_idx" ON "refresh_tokens" USING btree ("expires_at");
--> statement-breakpoint
-- HAND-ADDED: row-level security for the new table. No tenant_id of its own;
-- like password_reset_tokens, it is visible iff its user is (see 0002).
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON refresh_tokens;--> statement-breakpoint
CREATE POLICY tenant_isolation ON refresh_tokens
  USING (app_rls_bypass() OR EXISTS (SELECT 1 FROM users p WHERE p.id = refresh_tokens.user_id))
  WITH CHECK (app_rls_bypass() OR EXISTS (SELECT 1 FROM users p WHERE p.id = refresh_tokens.user_id));
