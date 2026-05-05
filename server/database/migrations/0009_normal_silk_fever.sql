CREATE TYPE "public"."vault_access_event_type" AS ENUM('unlock', 'lock', 'auto_lock', 'ui_reveal', 'orchestrator_reveal', 'orchestrator_search', 'entry_create', 'entry_update', 'entry_delete');--> statement-breakpoint
CREATE TABLE "user_vault_credentials" (
	"user_id" text PRIMARY KEY NOT NULL,
	"master_salt" "bytea" NOT NULL,
	"master_verifier" "bytea" NOT NULL,
	"master_kdf_salt" "bytea" NOT NULL,
	"argon2_params" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_access_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"entry_id" text,
	"event_type" "vault_access_event_type" NOT NULL,
	"field_name" text,
	"reason" text,
	"conversation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"folder_id" text,
	"title" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vault_entry_tags" (
	"entry_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vault_entry_tags_entry_id_tag_id_pk" PRIMARY KEY("entry_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "vault_folders" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vault_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_vault_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"workspace_salt" "bytea" NOT NULL,
	"wrapped_dek" "bytea" NOT NULL,
	"wrap_iv" "bytea" NOT NULL,
	"wrap_tag" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_vault_credentials" ADD CONSTRAINT "user_vault_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_access_log" ADD CONSTRAINT "vault_access_log_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_access_log" ADD CONSTRAINT "vault_access_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_access_log" ADD CONSTRAINT "vault_access_log_entry_id_vault_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."vault_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_access_log" ADD CONSTRAINT "vault_access_log_conversation_id_orchestrator_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."orchestrator_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_entries" ADD CONSTRAINT "vault_entries_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_entries" ADD CONSTRAINT "vault_entries_folder_id_vault_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."vault_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_entries" ADD CONSTRAINT "vault_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_entry_tags" ADD CONSTRAINT "vault_entry_tags_entry_id_vault_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."vault_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_entry_tags" ADD CONSTRAINT "vault_entry_tags_tag_id_vault_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."vault_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_folders" ADD CONSTRAINT "vault_folders_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_folders" ADD CONSTRAINT "vault_folders_parent_id_vault_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."vault_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_tags" ADD CONSTRAINT "vault_tags_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_vault_keys" ADD CONSTRAINT "workspace_vault_keys_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vault_access_log_org_created_idx" ON "vault_access_log" USING btree ("organisation_id","created_at");--> statement-breakpoint
CREATE INDEX "vault_access_log_org_event_idx" ON "vault_access_log" USING btree ("organisation_id","event_type");--> statement-breakpoint
CREATE INDEX "vault_entries_org_folder_idx" ON "vault_entries" USING btree ("organisation_id","folder_id");--> statement-breakpoint
CREATE INDEX "vault_entries_org_deleted_idx" ON "vault_entries" USING btree ("organisation_id","deleted_at");--> statement-breakpoint
CREATE INDEX "vault_folders_org_parent_idx" ON "vault_folders" USING btree ("organisation_id","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vault_tags_org_name_lower_unique" ON "vault_tags" USING btree ("organisation_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_vault_keys_org_unique" ON "workspace_vault_keys" USING btree ("organisation_id");