CREATE TYPE "cookbook"."journal_item_kind" AS ENUM('used', 'bought');--> statement-breakpoint
CREATE TABLE "cookbook"."journal_dishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"recipe_id" uuid,
	"name" text NOT NULL,
	"match_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cookbook"."journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cooked_on" date NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"photo_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cookbook"."journal_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"kind" "cookbook"."journal_item_kind" NOT NULL,
	"position" smallint NOT NULL,
	"name" text NOT NULL,
	"match_key" text NOT NULL,
	"quantity" real,
	"unit" text,
	"used_all" boolean DEFAULT false NOT NULL,
	"food_id" uuid
);
--> statement-breakpoint
ALTER TABLE "cookbook"."journal_dishes" ADD CONSTRAINT "journal_dishes_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "cookbook"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."journal_dishes" ADD CONSTRAINT "journal_dishes_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "cookbook"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."journal_entries" ADD CONSTRAINT "journal_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cookbook"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."journal_items" ADD CONSTRAINT "journal_items_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "cookbook"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."journal_items" ADD CONSTRAINT "journal_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "cookbook"."foods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_dishes_entry_idx" ON "cookbook"."journal_dishes" USING btree ("entry_id","position");--> statement-breakpoint
CREATE INDEX "journal_dishes_recipe_idx" ON "cookbook"."journal_dishes" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "journal_user_day_idx" ON "cookbook"."journal_entries" USING btree ("user_id","cooked_on","created_at");--> statement-breakpoint
CREATE INDEX "journal_items_entry_idx" ON "cookbook"."journal_items" USING btree ("entry_id","kind","position");--> statement-breakpoint
CREATE INDEX "journal_items_food_id_idx" ON "cookbook"."journal_items" USING btree ("food_id");