CREATE TABLE "weather_daily" (
	"lat_e2" integer NOT NULL,
	"lon_e2" integer NOT NULL,
	"date" date NOT NULL,
	"t_min" real,
	"t_max" real,
	"t_mean" real,
	"sunshine_s" real,
	"radiation_mj_m2" real,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weather_daily_lat_e2_lon_e2_date_pk" PRIMARY KEY("lat_e2","lon_e2","date")
);
--> statement-breakpoint
ALTER TABLE "household" ADD COLUMN "location" jsonb;