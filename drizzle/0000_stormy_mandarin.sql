CREATE SCHEMA IF NOT EXISTS "cookbook";
--> statement-breakpoint
CREATE TYPE "cookbook"."authored_by" AS ENUM('human', 'ai');--> statement-breakpoint
CREATE TYPE "cookbook"."food_source" AS ENUM('usda', 'vn_fct', 'label', 'ai_estimate');--> statement-breakpoint
CREATE TYPE "cookbook"."grams_source" AS ENUM('mass', 'volume', 'estimate');--> statement-breakpoint
CREATE TYPE "cookbook"."source_channel" AS ENUM('web', 'mcp');--> statement-breakpoint
CREATE TABLE "cookbook"."foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"source" "cookbook"."food_source" NOT NULL,
	"source_ref" text,
	"name_vi" text,
	"name_en" text,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"search_text" text NOT NULL,
	"kcal" real NOT NULL,
	"protein_g" real NOT NULL,
	"fat_g" real NOT NULL,
	"carbs_g" real NOT NULL,
	"fiber_g" real,
	"sugar_g" real,
	"sodium_mg" real,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"density_g_per_ml" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cookbook"."mcp_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cookbook"."recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"section" text,
	"name" text NOT NULL,
	"quantity" real,
	"quantity_max" real,
	"unit" text,
	"note" text,
	"optional" boolean DEFAULT false NOT NULL,
	"food_id" uuid,
	"grams" real,
	"grams_source" "cookbook"."grams_source"
);
--> statement-breakpoint
CREATE TABLE "cookbook"."recipe_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"section" text,
	"body" text NOT NULL,
	"timer_seconds" integer
);
--> statement-breakpoint
CREATE TABLE "cookbook"."recipe_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"change_note" text,
	"source_channel" "cookbook"."source_channel" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cookbook"."recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"servings" real DEFAULT 1 NOT NULL,
	"yield_label" text,
	"prep_minutes" integer,
	"cook_minutes" integer,
	"cuisine" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"source_url" text,
	"source_label" text,
	"source_channel" "cookbook"."source_channel" DEFAULT 'web' NOT NULL,
	"authored_by" "cookbook"."authored_by" DEFAULT 'human' NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cookbook"."users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cookbook"."foods" ADD CONSTRAINT "foods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cookbook"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."mcp_tokens" ADD CONSTRAINT "mcp_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cookbook"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "cookbook"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "cookbook"."foods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."recipe_steps" ADD CONSTRAINT "recipe_steps_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "cookbook"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."recipe_versions" ADD CONSTRAINT "recipe_versions_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "cookbook"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."recipes" ADD CONSTRAINT "recipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cookbook"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "foods_user_id_idx" ON "cookbook"."foods" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foods_source_ref_idx" ON "cookbook"."foods" USING btree ("source","source_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_tokens_hash_idx" ON "cookbook"."mcp_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "mcp_tokens_user_idx" ON "cookbook"."mcp_tokens" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_recipe_idx" ON "cookbook"."recipe_ingredients" USING btree ("recipe_id","position");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_food_id_idx" ON "cookbook"."recipe_ingredients" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "recipe_steps_recipe_idx" ON "cookbook"."recipe_steps" USING btree ("recipe_id","position");--> statement-breakpoint
CREATE INDEX "recipe_versions_recipe_idx" ON "cookbook"."recipe_versions" USING btree ("recipe_id","created_at");--> statement-breakpoint
CREATE INDEX "recipes_user_updated_idx" ON "cookbook"."recipes" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "cookbook"."users" USING btree ("email");