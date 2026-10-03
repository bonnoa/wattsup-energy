CREATE TABLE "contract_period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"valid_from" date NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_period_contract_from_uq" UNIQUE("contract_id","valid_from")
);
--> statement-breakpoint
ALTER TABLE "contract" ADD COLUMN "status" text DEFAULT 'simulated' NOT NULL;--> statement-breakpoint
ALTER TABLE "contract" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "contract" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "contract_period" ADD CONSTRAINT "contract_period_contract_id_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_period" ADD CONSTRAINT "contract_period_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Données existantes (T18b) : le contrat actuel devient souscrit depuis la première donnée
-- du foyer (ou sa date de création), les autres deviennent simulés ; chaque grille devient
-- la première période de son contrat.
UPDATE "contract" c SET
	"status" = CASE WHEN c."is_current" THEN 'subscribed' ELSE 'simulated' END,
	"start_date" = CASE WHEN c."is_current" THEN coalesce(
		(SELECT (min(e."start") AT TIME ZONE 'Europe/Paris')::date FROM "energy_interval" e WHERE e."household_id" = c."household_id"),
		(c."created_at" AT TIME ZONE 'Europe/Paris')::date
	) END;
--> statement-breakpoint
INSERT INTO "contract_period" ("contract_id", "household_id", "valid_from", "config")
SELECT c."id", c."household_id", coalesce(c."start_date", (c."created_at" AT TIME ZONE 'Europe/Paris')::date), c."config"
FROM "contract" c;
