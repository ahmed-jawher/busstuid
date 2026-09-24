DROP TRIGGER legal_acceptances_no_truncate ON "legal_acceptances";
DROP TRIGGER legal_acceptances_append_only ON "legal_acceptances";
DROP TABLE "legal_acceptances";
DROP TYPE "LegalDocument";
ALTER TABLE "users" DROP COLUMN "terms_accepted_at", DROP COLUMN "terms_version";
