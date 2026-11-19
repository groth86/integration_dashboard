ALTER TABLE "integration_records" ADD COLUMN "workflow" text;--> statement-breakpoint
ALTER TABLE "integration_records" ADD COLUMN "order_reference" text;--> statement-breakpoint
ALTER TABLE "integration_records" ADD COLUMN "response_code" integer;--> statement-breakpoint
ALTER TABLE "integration_records" ADD COLUMN "response_description" text;--> statement-breakpoint
ALTER TABLE "integration_records" ADD COLUMN "request_payload" text;--> statement-breakpoint
ALTER TABLE "integration_records" ADD COLUMN "response_payload" text;--> statement-breakpoint
ALTER TABLE "integration_records" ADD COLUMN "payload_stored_at" timestamp;--> statement-breakpoint
ALTER TABLE "integration_records" ADD COLUMN "attempt_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_records" ADD COLUMN "first_seen_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
-- Existing rows: first seen = their own timestamp, not the migration time.
UPDATE "integration_records" SET "first_seen_at" = "timestamp";--> statement-breakpoint
-- Collapse existing duplicates (same account + integration type + record id)
-- into the latest row, carrying the attempt count and first-seen time, so the
-- unique index below can be built.
WITH "groups" AS (
	SELECT "account_id", "integration_type", "record_id",
		count(*)::int AS "n", min("timestamp") AS "first_ts"
	FROM "integration_records"
	WHERE "account_id" IS NOT NULL AND "record_id" IS NOT NULL
	GROUP BY "account_id", "integration_type", "record_id"
	HAVING count(*) > 1
)
UPDATE "integration_records" r
SET "attempt_count" = g."n", "first_seen_at" = g."first_ts"
FROM "groups" g
WHERE r."account_id" = g."account_id"
	AND r."integration_type" = g."integration_type"
	AND r."record_id" = g."record_id";--> statement-breakpoint
DELETE FROM "integration_records" a
USING "integration_records" b
WHERE a."account_id" = b."account_id"
	AND a."integration_type" = b."integration_type"
	AND a."record_id" = b."record_id"
	AND (a."timestamp" < b."timestamp" OR (a."timestamp" = b."timestamp" AND a."id" < b."id"));--> statement-breakpoint
CREATE UNIQUE INDEX "integration_records_record_key" ON "integration_records" USING btree ("account_id","integration_type","record_id");--> statement-breakpoint
CREATE INDEX "integration_records_timestamp_idx" ON "integration_records" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "integration_records_order_ref_idx" ON "integration_records" USING btree ("order_reference");--> statement-breakpoint
CREATE INDEX "integration_records_payload_expiry_idx" ON "integration_records" USING btree ("payload_stored_at") WHERE "integration_records"."payload_stored_at" is not null;