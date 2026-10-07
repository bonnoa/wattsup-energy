CREATE TYPE "public"."idea_status" AS ENUM('new', 'planned', 'in_progress', 'done');--> statement-breakpoint
CREATE TABLE "idea" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" text,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "idea_status" DEFAULT 'new' NOT NULL,
	"version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idea_vote" (
	"idea_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idea_vote_idea_id_user_id_pk" PRIMARY KEY("idea_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "idea" ADD CONSTRAINT "idea_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_vote" ADD CONSTRAINT "idea_vote_idea_id_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."idea"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_vote" ADD CONSTRAINT "idea_vote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idea_author_created_idx" ON "idea" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "idea_vote_user_idx" ON "idea_vote" USING btree ("user_id");