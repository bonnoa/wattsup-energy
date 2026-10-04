ALTER TABLE "household" ADD COLUMN "onboarding_step" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "household" ADD COLUMN "onboarding_done" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Les foyers existants sont déjà configurés : pas de parcours de bienvenue pour eux.
UPDATE "household" SET "onboarding_done" = true;
