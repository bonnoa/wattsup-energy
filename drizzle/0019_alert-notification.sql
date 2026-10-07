CREATE TABLE "alert_notification" (
	"household_id" uuid NOT NULL,
	"key" text NOT NULL,
	"channel" text NOT NULL,
	"level" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_notification_household_id_key_channel_pk" PRIMARY KEY("household_id","key","channel")
);
--> statement-breakpoint
ALTER TABLE "alert_notification" ADD CONSTRAINT "alert_notification_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;