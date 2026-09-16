CREATE TYPE "cookbook"."goal_metric" AS ENUM('meals', 'new_dishes', 'tagged');--> statement-breakpoint
CREATE TYPE "cookbook"."streak_kind" AS ENUM('daily', 'daily_rest', 'weekly');--> statement-breakpoint
CREATE TYPE "cookbook"."streak_trigger" AS ENUM('tick', 'any_meal', 'new_dish');--> statement-breakpoint
CREATE TABLE "cookbook"."goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"metric" "cookbook"."goal_metric" NOT NULL,
	"tag" text,
	"target" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cookbook"."streak_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"streak_id" uuid NOT NULL,
	"day" date NOT NULL,
	"entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cookbook"."streaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "cookbook"."streak_kind" NOT NULL,
	"rest_per_week" smallint DEFAULT 0 NOT NULL,
	"times_per_week" smallint DEFAULT 1 NOT NULL,
	"trigger" "cookbook"."streak_trigger" NOT NULL,
	"remind_at" text,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cookbook"."wishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"match_key" text NOT NULL,
	"recipe_id" uuid,
	"source_url" text,
	"note" text,
	"conquered_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cookbook"."goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cookbook"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."streak_checkins" ADD CONSTRAINT "streak_checkins_streak_id_streaks_id_fk" FOREIGN KEY ("streak_id") REFERENCES "cookbook"."streaks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."streak_checkins" ADD CONSTRAINT "streak_checkins_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "cookbook"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."streaks" ADD CONSTRAINT "streaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cookbook"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."wishes" ADD CONSTRAINT "wishes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cookbook"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."wishes" ADD CONSTRAINT "wishes_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "cookbook"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."wishes" ADD CONSTRAINT "wishes_conquered_entry_id_journal_entries_id_fk" FOREIGN KEY ("conquered_entry_id") REFERENCES "cookbook"."journal_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "cookbook"."goals" USING btree ("user_id","ends_on");--> statement-breakpoint
CREATE INDEX "streak_checkins_streak_day_idx" ON "cookbook"."streak_checkins" USING btree ("streak_id","day");--> statement-breakpoint
CREATE INDEX "streak_checkins_entry_idx" ON "cookbook"."streak_checkins" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "streaks_user_idx" ON "cookbook"."streaks" USING btree ("user_id","position");--> statement-breakpoint
CREATE INDEX "wishes_user_idx" ON "cookbook"."wishes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "wishes_recipe_idx" ON "cookbook"."wishes" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "wishes_entry_idx" ON "cookbook"."wishes" USING btree ("conquered_entry_id");