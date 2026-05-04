-- Add per-user UI locale preference. Defaults to 'de' (DESIGN-I18N).
ALTER TABLE "users" ADD COLUMN "locale" varchar(8) DEFAULT 'de' NOT NULL;
--> statement-breakpoint

-- Add per-organisation HKDF salt for encryptForOrg/decryptForOrg (DESIGN-CRYPTO, ADR-014).
-- Add nullable first, backfill existing rows with a random 32-char hex salt
-- (md5 over random + clock_timestamp avoids requiring the pgcrypto extension),
-- then enforce NOT NULL. New rows are populated by organisationsService.create
-- with crypto.randomBytes from node:crypto.
ALTER TABLE "organisations" ADD COLUMN "crypto_salt" text;
--> statement-breakpoint
UPDATE "organisations" SET "crypto_salt" = md5(random()::text || clock_timestamp()::text) WHERE "crypto_salt" IS NULL;
--> statement-breakpoint
ALTER TABLE "organisations" ALTER COLUMN "crypto_salt" SET NOT NULL;
