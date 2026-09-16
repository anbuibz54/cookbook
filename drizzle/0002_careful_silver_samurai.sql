CREATE TYPE "cookbook"."store_kind" AS ENUM('bhx', 'cho', 'sieu_thi', 'online');--> statement-breakpoint
CREATE TABLE "cookbook"."pantry_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"food_id" uuid,
	"name" text NOT NULL,
	"match_key" text NOT NULL,
	"quantity" real,
	"quantity_max" real,
	"unit" text,
	"grams" real,
	"expires_on" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cookbook"."shopping_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"food_id" uuid,
	"recipe_id" uuid,
	"store_id" uuid,
	"name" text NOT NULL,
	"match_key" text NOT NULL,
	"quantity" real,
	"unit" text,
	"grams" real,
	"note" text,
	"bought_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cookbook"."stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "cookbook"."store_kind" NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"maps_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cookbook"."pantry_items" ADD CONSTRAINT "pantry_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cookbook"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."pantry_items" ADD CONSTRAINT "pantry_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "cookbook"."foods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."shopping_items" ADD CONSTRAINT "shopping_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cookbook"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."shopping_items" ADD CONSTRAINT "shopping_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "cookbook"."foods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."shopping_items" ADD CONSTRAINT "shopping_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "cookbook"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."shopping_items" ADD CONSTRAINT "shopping_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "cookbook"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."stores" ADD CONSTRAINT "stores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cookbook"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pantry_user_key_idx" ON "cookbook"."pantry_items" USING btree ("user_id","match_key");--> statement-breakpoint
CREATE INDEX "pantry_user_expiry_idx" ON "cookbook"."pantry_items" USING btree ("user_id","expires_on");--> statement-breakpoint
CREATE INDEX "pantry_food_id_idx" ON "cookbook"."pantry_items" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "shopping_user_open_idx" ON "cookbook"."shopping_items" USING btree ("user_id","created_at") WHERE "cookbook"."shopping_items"."bought_at" is null;--> statement-breakpoint
CREATE INDEX "shopping_user_store_idx" ON "cookbook"."shopping_items" USING btree ("user_id","store_id");--> statement-breakpoint
CREATE INDEX "shopping_recipe_idx" ON "cookbook"."shopping_items" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "shopping_food_id_idx" ON "cookbook"."shopping_items" USING btree ("food_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stores_user_name_idx" ON "cookbook"."stores" USING btree ("user_id","kind","name");--> statement-breakpoint
CREATE INDEX "stores_user_idx" ON "cookbook"."stores" USING btree ("user_id");