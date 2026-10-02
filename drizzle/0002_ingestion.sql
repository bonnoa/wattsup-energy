CREATE TYPE "public"."data_source" AS ENUM('ha', 'csv');--> statement-breakpoint
CREATE TYPE "public"."interval_granularity" AS ENUM('hour', 'day');--> statement-breakpoint
CREATE TYPE "public"."tempo_color" AS ENUM('bleu', 'blanc', 'rouge');--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"icon" text,
	"color" text,
	"is_heating" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_household_slug_uq" UNIQUE("household_id","slug")
);
--> statement-breakpoint
CREATE TABLE "energy_interval" (
	"household_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"start" timestamp with time zone NOT NULL,
	"granularity" interval_granularity NOT NULL,
	"tariff_slot" text DEFAULT 'all' NOT NULL,
	"kwh" numeric(12, 4) NOT NULL,
	"source" "data_source" NOT NULL,
	CONSTRAINT "energy_interval_household_id_metric_start_granularity_tariff_slot_pk" PRIMARY KEY("household_id","metric","start","granularity","tariff_slot")
);
--> statement-breakpoint
CREATE TABLE "ingest_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"http_status" integer NOT NULL,
	"mode" text,
	"payload_size" integer NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "meter_state" (
	"household_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"value" double precision NOT NULL,
	CONSTRAINT "meter_state_household_id_metric_pk" PRIMARY KEY("household_id","metric")
);
--> statement-breakpoint
CREATE TABLE "tempo_override" (
	"household_id" uuid NOT NULL,
	"date" date NOT NULL,
	"color" "tempo_color" NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "tempo_override_household_id_date_pk" PRIMARY KEY("household_id","date")
);
--> statement-breakpoint
CREATE TABLE "weather_daily" (
	"household_id" uuid NOT NULL,
	"date" date NOT NULL,
	"t_min" real NOT NULL,
	"t_max" real NOT NULL,
	"t_sum" double precision NOT NULL,
	"t_count" integer NOT NULL,
	CONSTRAINT "weather_daily_household_id_date_pk" PRIMARY KEY("household_id","date")
);
--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_interval" ADD CONSTRAINT "energy_interval_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_log" ADD CONSTRAINT "ingest_log_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_state" ADD CONSTRAINT "meter_state_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tempo_override" ADD CONSTRAINT "tempo_override_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather_daily" ADD CONSTRAINT "weather_daily_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "energy_interval_household_start_idx" ON "energy_interval" USING btree ("household_id","start");--> statement-breakpoint
CREATE INDEX "ingest_log_household_received_idx" ON "ingest_log" USING btree ("household_id","received_at");