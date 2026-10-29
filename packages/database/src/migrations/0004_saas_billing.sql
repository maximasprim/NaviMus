CREATE TABLE IF NOT EXISTS "billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar(100) NOT NULL,
	"type" varchar(100) NOT NULL,
	"tenant_id" uuid,
	"outcome" varchar(60),
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "stripe_subscription_id" varchar(100);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "subscription_status" varchar(30);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "subscription_current_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "subscription_cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "subscription_event_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_events_event_id_unique" ON "billing_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_events_tenant_idx" ON "billing_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plans_stripe_price_unique" ON "plans" USING btree ("stripe_price_id") WHERE "plans"."stripe_price_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_stripe_customer_unique" ON "tenants" USING btree ("stripe_customer_id") WHERE "tenants"."stripe_customer_id" IS NOT NULL;