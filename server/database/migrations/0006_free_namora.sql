CREATE TYPE "public"."gh_issue_state" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."gh_pull_state" AS ENUM('open', 'closed', 'merged');--> statement-breakpoint
CREATE TABLE "gh_commits" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"repo_id" text NOT NULL,
	"sha" text NOT NULL,
	"message" text NOT NULL,
	"author_name" text,
	"author_email" text,
	"author_login" text,
	"author_avatar_url" text,
	"authored_at" timestamp with time zone,
	"committer_login" text,
	"committed_at" timestamp with time zone,
	"html_url" text NOT NULL,
	"parents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gh_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"token_encrypted" text NOT NULL,
	"gh_user_login" text NOT NULL,
	"gh_user_id" bigint NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_validated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gh_issues" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"repo_id" text NOT NULL,
	"gh_id" bigint NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"state" "gh_issue_state" NOT NULL,
	"state_reason" text,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assignees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"author" jsonb NOT NULL,
	"comments_count" integer DEFAULT 0 NOT NULL,
	"gh_created_at" timestamp with time zone,
	"gh_updated_at" timestamp with time zone,
	"gh_closed_at" timestamp with time zone,
	"html_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gh_pulls" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"repo_id" text NOT NULL,
	"gh_id" bigint NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"state" "gh_pull_state" NOT NULL,
	"draft" boolean DEFAULT false NOT NULL,
	"base_ref" text NOT NULL,
	"head_ref" text NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assignees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requested_reviewers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"author" jsonb NOT NULL,
	"comments_count" integer DEFAULT 0 NOT NULL,
	"additions" integer,
	"deletions" integer,
	"changed_files" integer,
	"gh_created_at" timestamp with time zone,
	"gh_updated_at" timestamp with time zone,
	"gh_closed_at" timestamp with time zone,
	"gh_merged_at" timestamp with time zone,
	"html_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gh_repos" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"gh_id" bigint NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"default_branch" text,
	"private" boolean DEFAULT false NOT NULL,
	"description" text,
	"tracked" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "gh_commits" ADD CONSTRAINT "gh_commits_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gh_commits" ADD CONSTRAINT "gh_commits_repo_id_gh_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."gh_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gh_connections" ADD CONSTRAINT "gh_connections_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gh_issues" ADD CONSTRAINT "gh_issues_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gh_issues" ADD CONSTRAINT "gh_issues_repo_id_gh_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."gh_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gh_pulls" ADD CONSTRAINT "gh_pulls_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gh_pulls" ADD CONSTRAINT "gh_pulls_repo_id_gh_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."gh_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gh_repos" ADD CONSTRAINT "gh_repos_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gh_repos" ADD CONSTRAINT "gh_repos_connection_id_gh_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."gh_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gh_commits_repo_sha_unique" ON "gh_commits" USING btree ("repo_id","sha");--> statement-breakpoint
CREATE INDEX "gh_commits_repo_authored_at_idx" ON "gh_commits" USING btree ("repo_id","authored_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "gh_connections_org_unique" ON "gh_connections" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gh_issues_repo_gh_id_unique" ON "gh_issues" USING btree ("repo_id","gh_id");--> statement-breakpoint
CREATE INDEX "gh_issues_repo_state_idx" ON "gh_issues" USING btree ("repo_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "gh_pulls_repo_gh_id_unique" ON "gh_pulls" USING btree ("repo_id","gh_id");--> statement-breakpoint
CREATE INDEX "gh_pulls_repo_state_idx" ON "gh_pulls" USING btree ("repo_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "gh_repos_org_gh_id_unique" ON "gh_repos" USING btree ("organisation_id","gh_id");--> statement-breakpoint
CREATE INDEX "gh_repos_org_tracked_idx" ON "gh_repos" USING btree ("organisation_id","tracked");