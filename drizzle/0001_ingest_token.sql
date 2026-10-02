CREATE TABLE "ingest_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"prefix" text NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "ingest_token_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
ALTER TABLE "ingest_token" ADD CONSTRAINT "ingest_token_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingest_token_household_idx" ON "ingest_token" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingest_token_one_active_idx" ON "ingest_token" USING btree ("household_id") WHERE "ingest_token"."revoked_at" is null;