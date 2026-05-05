CREATE TYPE "public"."orchestrator_action_class" AS ENUM('auto', 'confirm');--> statement-breakpoint
CREATE TYPE "public"."orchestrator_action_status" AS ENUM('pending_confirmation', 'confirmed', 'cancelled', 'executed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."orchestrator_conversation_mode" AS ENUM('read_only', 'read_write');--> statement-breakpoint
CREATE TYPE "public"."orchestrator_message_role" AS ENUM('user', 'assistant', 'tool_result');--> statement-breakpoint
CREATE TABLE "ai_models" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"model_id" text NOT NULL,
	"display_name" text NOT NULL,
	"context_window" integer NOT NULL,
	"supports_tools" boolean DEFAULT false NOT NULL,
	"supports_streaming" boolean DEFAULT false NOT NULL,
	"supports_vision" boolean DEFAULT false NOT NULL,
	"input_price_per_mtok" numeric(10, 4),
	"output_price_per_mtok" numeric(10, 4),
	"enabled" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_provider_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"base_url" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"sdk_provider_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_providers_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "orchestrator_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"message_id" text,
	"user_id" text,
	"model_id" text,
	"tool_name" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"result" jsonb,
	"class" "orchestrator_action_class" NOT NULL,
	"status" "orchestrator_action_status" DEFAULT 'pending_confirmation' NOT NULL,
	"affected_count" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"executed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "orchestrator_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"user_id" text,
	"title" text DEFAULT '' NOT NULL,
	"mode" "orchestrator_conversation_mode" DEFAULT 'read_only' NOT NULL,
	"model_id" text,
	"system_prompt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "orchestrator_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" "orchestrator_message_role" NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orchestrator_workspace_settings" (
	"organisation_id" text PRIMARY KEY NOT NULL,
	"default_model_id" text,
	"ai_display_name" text DEFAULT 'Claude-Orchestrator' NOT NULL,
	"history_limit" integer DEFAULT 30 NOT NULL,
	"system_prompt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_credentials" ADD CONSTRAINT "ai_provider_credentials_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_credentials" ADD CONSTRAINT "ai_provider_credentials_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_credentials" ADD CONSTRAINT "ai_provider_credentials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrator_actions" ADD CONSTRAINT "orchestrator_actions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrator_actions" ADD CONSTRAINT "orchestrator_actions_conversation_id_orchestrator_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."orchestrator_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrator_actions" ADD CONSTRAINT "orchestrator_actions_message_id_orchestrator_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."orchestrator_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrator_actions" ADD CONSTRAINT "orchestrator_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrator_actions" ADD CONSTRAINT "orchestrator_actions_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrator_conversations" ADD CONSTRAINT "orchestrator_conversations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrator_conversations" ADD CONSTRAINT "orchestrator_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrator_conversations" ADD CONSTRAINT "orchestrator_conversations_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrator_messages" ADD CONSTRAINT "orchestrator_messages_conversation_id_orchestrator_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."orchestrator_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrator_workspace_settings" ADD CONSTRAINT "orchestrator_workspace_settings_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrator_workspace_settings" ADD CONSTRAINT "orchestrator_workspace_settings_default_model_id_ai_models_id_fk" FOREIGN KEY ("default_model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_models_provider_model_unique" ON "ai_models" USING btree ("provider_id","model_id");--> statement-breakpoint
CREATE INDEX "ai_models_provider_default_idx" ON "ai_models" USING btree ("provider_id","is_default");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_provider_credentials_org_provider_unique" ON "ai_provider_credentials" USING btree ("organisation_id","provider_id");--> statement-breakpoint
CREATE INDEX "orchestrator_actions_conversation_idx" ON "orchestrator_actions" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "orchestrator_actions_status_idx" ON "orchestrator_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orchestrator_messages_conversation_idx" ON "orchestrator_messages" USING btree ("conversation_id","created_at");