CREATE TABLE "alert_dismissal" (
	"household_id" uuid NOT NULL,
	"key" text NOT NULL,
	"level" integer NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_dismissal_household_id_key_pk" PRIMARY KEY("household_id","key")
);
--> statement-breakpoint
ALTER TABLE "alert_dismissal" ADD CONSTRAINT "alert_dismissal_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;