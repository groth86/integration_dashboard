CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "integration_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp NOT NULL,
	"business_unit" text,
	"system" text,
	"account_id" integer,
	"direction" text,
	"integration_type" text NOT NULL,
	"record_id" text,
	"status" text NOT NULL,
	"response" text
);
--> statement-breakpoint
CREATE TABLE "user_accounts" (
	"user_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	CONSTRAINT "user_accounts_user_id_account_id_pk" PRIMARY KEY("user_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "integration_records" ADD CONSTRAINT "integration_records_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_accounts" ADD CONSTRAINT "user_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_accounts" ADD CONSTRAINT "user_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;