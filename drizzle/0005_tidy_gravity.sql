CREATE TYPE "cookbook"."ai_provider_kind" AS ENUM('anthropic', 'azure');--> statement-breakpoint
CREATE TABLE "cookbook"."ai_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "cookbook"."ai_provider_kind" NOT NULL,
	"label" text NOT NULL,
	"endpoint" text,
	"model" text NOT NULL,
	"api_key_enc" text NOT NULL,
	"api_key_hint" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cookbook"."ai_providers" ADD CONSTRAINT "ai_providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cookbook"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_providers_user_idx" ON "cookbook"."ai_providers" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_providers_one_active_idx" ON "cookbook"."ai_providers" USING btree ("user_id") WHERE "cookbook"."ai_providers"."active";