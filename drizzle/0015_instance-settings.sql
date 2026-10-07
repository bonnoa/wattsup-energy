CREATE TYPE "public"."signup_mode" AS ENUM('open', 'invite', 'closed');--> statement-breakpoint
CREATE TABLE "instance_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"signup_mode" "signup_mode",
	"invite_codes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instance_settings" ADD CONSTRAINT "instance_settings_single_row" CHECK ("id" = 1);
