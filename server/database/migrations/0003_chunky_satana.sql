CREATE TYPE "public"."kb_entry_author_type" AS ENUM('human', 'ai');--> statement-breakpoint
CREATE TYPE "public"."kb_entry_source_type" AS ENUM('manual', 'commit', 'claude_code_session', 'chat', 'external');--> statement-breakpoint
CREATE TYPE "public"."kb_entry_status" AS ENUM('inbox', 'draft', 'verified', 'archived');--> statement-breakpoint
CREATE TABLE "kb_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "kb_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"body_search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce("kb_entries"."title", '')), 'A') || setweight(to_tsvector('simple', coalesce("kb_entries"."body_md", '')), 'B')) STORED,
	"category_id" text,
	"status" "kb_entry_status" DEFAULT 'draft' NOT NULL,
	"author_type" "kb_entry_author_type" DEFAULT 'human' NOT NULL,
	"author_name" text DEFAULT '' NOT NULL,
	"source_type" "kb_entry_source_type" DEFAULT 'manual' NOT NULL,
	"source_ref" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "kb_entry_links" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"from_entry_id" text NOT NULL,
	"to_entry_id" text,
	"to_slug" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_entry_tags" (
	"entry_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kb_entry_tags_entry_id_tag_id_pk" PRIMARY KEY("entry_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "kb_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "kb_categories" ADD CONSTRAINT "kb_categories_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_categories" ADD CONSTRAINT "kb_categories_parent_id_kb_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."kb_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_entries" ADD CONSTRAINT "kb_entries_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_entries" ADD CONSTRAINT "kb_entries_category_id_kb_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."kb_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_entries" ADD CONSTRAINT "kb_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_entry_links" ADD CONSTRAINT "kb_entry_links_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_entry_links" ADD CONSTRAINT "kb_entry_links_from_entry_id_kb_entries_id_fk" FOREIGN KEY ("from_entry_id") REFERENCES "public"."kb_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_entry_links" ADD CONSTRAINT "kb_entry_links_to_entry_id_kb_entries_id_fk" FOREIGN KEY ("to_entry_id") REFERENCES "public"."kb_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_entry_tags" ADD CONSTRAINT "kb_entry_tags_entry_id_kb_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."kb_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_entry_tags" ADD CONSTRAINT "kb_entry_tags_tag_id_kb_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."kb_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_tags" ADD CONSTRAINT "kb_tags_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kb_categories_org_slug_unique" ON "kb_categories" USING btree ("organisation_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "kb_entries_org_slug_unique" ON "kb_entries" USING btree ("organisation_id","slug");--> statement-breakpoint
CREATE INDEX "kb_entries_org_status_idx" ON "kb_entries" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "kb_entries_org_category_idx" ON "kb_entries" USING btree ("organisation_id","category_id");--> statement-breakpoint
CREATE INDEX "kb_entries_body_search_gin" ON "kb_entries" USING gin ("body_search");--> statement-breakpoint
CREATE INDEX "kb_entry_links_from_idx" ON "kb_entry_links" USING btree ("from_entry_id");--> statement-breakpoint
CREATE INDEX "kb_entry_links_to_entry_idx" ON "kb_entry_links" USING btree ("to_entry_id");--> statement-breakpoint
CREATE INDEX "kb_entry_links_org_to_slug_idx" ON "kb_entry_links" USING btree ("organisation_id","to_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "kb_tags_org_name_lower_unique" ON "kb_tags" USING btree ("organisation_id",lower("name"));