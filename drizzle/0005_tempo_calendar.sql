CREATE TABLE "tempo_calendar" (
	"date" date PRIMARY KEY NOT NULL,
	"color" "tempo_color" NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
