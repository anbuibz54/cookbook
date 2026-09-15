ALTER TYPE "cookbook"."grams_source" ADD VALUE 'portion';--> statement-breakpoint
CREATE TABLE "cookbook"."food_portions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"label" text NOT NULL,
	"grams" real NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cookbook"."foods" ADD COLUMN "name_vi_reviewed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cookbook"."foods" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "cookbook"."food_portions" ADD CONSTRAINT "food_portions_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "cookbook"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_portions_food_idx" ON "cookbook"."food_portions" USING btree ("food_id","unit");