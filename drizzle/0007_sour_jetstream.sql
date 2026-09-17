CREATE TABLE "cookbook"."oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_clients_client_id_key" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "cookbook"."oauth_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cookbook"."mcp_tokens" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "cookbook"."mcp_tokens" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cookbook"."mcp_tokens" ADD COLUMN "refresh_hash" text;--> statement-breakpoint
ALTER TABLE "cookbook"."mcp_tokens" ADD COLUMN "refresh_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cookbook"."oauth_codes" ADD CONSTRAINT "oauth_codes_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "cookbook"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."oauth_codes" ADD CONSTRAINT "oauth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cookbook"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_codes_hash_idx" ON "cookbook"."oauth_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "oauth_codes_client_idx" ON "cookbook"."oauth_codes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_codes_user_idx" ON "cookbook"."oauth_codes" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "cookbook"."mcp_tokens" ADD CONSTRAINT "mcp_tokens_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "cookbook"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_tokens_refresh_idx" ON "cookbook"."mcp_tokens" USING btree ("refresh_hash");--> statement-breakpoint
CREATE INDEX "mcp_tokens_client_idx" ON "cookbook"."mcp_tokens" USING btree ("client_id");