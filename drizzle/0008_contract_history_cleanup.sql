DROP INDEX "contract_one_current_idx";--> statement-breakpoint
ALTER TABLE "contract" DROP COLUMN "config";--> statement-breakpoint
ALTER TABLE "contract" DROP COLUMN "is_current";