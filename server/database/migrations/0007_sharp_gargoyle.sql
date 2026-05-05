ALTER TABLE "gh_repos" DROP CONSTRAINT "gh_repos_connection_id_gh_connections_id_fk";
--> statement-breakpoint
ALTER TABLE "gh_repos" ALTER COLUMN "connection_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gh_repos" ADD CONSTRAINT "gh_repos_connection_id_gh_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."gh_connections"("id") ON DELETE set null ON UPDATE no action;