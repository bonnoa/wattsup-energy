ALTER TABLE "user" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
-- Administrateur de l'instance de référence (wattsup-energy.kraftpunk.app), fixé une fois
-- pour toutes. Sur une autre instance : UPDATE "user" SET is_admin = true WHERE email = '…'.
UPDATE "user" SET "is_admin" = true WHERE lower("email") = 'alexandre@bonno.xyz';
