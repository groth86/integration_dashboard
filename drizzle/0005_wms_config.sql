CREATE TABLE "account_wms_config" (
	"account_id" integer PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"token_url" text,
	"client_id" text,
	"client_secret" text,
	"scope" text,
	"status_url_template" text,
	"status_path" text,
	"error_status_value" text DEFAULT 'Imported with Errors' NOT NULL,
	"check_types" text DEFAULT 'Pick Ticket' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_wms_config" ADD CONSTRAINT "account_wms_config_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;