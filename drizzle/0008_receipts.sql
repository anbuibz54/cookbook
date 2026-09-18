CREATE TABLE "cookbook"."receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"raw_text" text,
	"name" text NOT NULL,
	"quantity" real,
	"unit" text,
	"price_vnd" integer,
	"kind" text DEFAULT 'food' NOT NULL,
	"to_pantry" boolean DEFAULT true NOT NULL,
	"shopping_item_id" uuid,
	"for_bakery" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cookbook"."receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"store_name" text,
	"store_kind" "cookbook"."store_kind",
	"bought_on" date NOT NULL,
	"total_vnd" integer,
	"photo_path" text,
	"source" text DEFAULT 'photo' NOT NULL,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cookbook"."receipt_lines" ADD CONSTRAINT "receipt_lines_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "cookbook"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."receipt_lines" ADD CONSTRAINT "receipt_lines_shopping_item_id_shopping_items_id_fk" FOREIGN KEY ("shopping_item_id") REFERENCES "cookbook"."shopping_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook"."receipts" ADD CONSTRAINT "receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cookbook"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipt_lines_receipt_idx" ON "cookbook"."receipt_lines" USING btree ("receipt_id","position");--> statement-breakpoint
CREATE INDEX "receipt_lines_shopping_idx" ON "cookbook"."receipt_lines" USING btree ("shopping_item_id");--> statement-breakpoint
CREATE INDEX "receipt_lines_bakery_idx" ON "cookbook"."receipt_lines" USING btree ("receipt_id") WHERE "cookbook"."receipt_lines"."for_bakery";--> statement-breakpoint
CREATE INDEX "receipts_user_idx" ON "cookbook"."receipts" USING btree ("user_id","bought_on");