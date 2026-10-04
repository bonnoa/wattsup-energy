CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"capacity" double precision,
	"installed_on" date NOT NULL,
	"cost_eur" numeric(10, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_household_kind_uq" UNIQUE("household_id","kind")
);
--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;