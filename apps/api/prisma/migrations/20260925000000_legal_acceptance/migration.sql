-- Proof of who agreed to what, and when. Append-only like the other safety records: an
-- acceptance is evidence, so it can never be edited or quietly removed.
CREATE TYPE "LegalDocument" AS ENUM ('terms', 'privacy', 'driver_safety');

CREATE TABLE "legal_acceptances" (
  "id"         UUID PRIMARY KEY,
  "user_id"    UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "document"   "LegalDocument" NOT NULL,
  "version"    TEXT NOT NULL,
  "accepted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "ip"         TEXT,
  "user_agent" TEXT
);
CREATE UNIQUE INDEX "legal_acceptances_user_id_document_version_key"
  ON "legal_acceptances" ("user_id", "document", "version");
CREATE INDEX "legal_acceptances_user_id_idx" ON "legal_acceptances" ("user_id");

-- The newest version each account has agreed to, so a sign-in can ask again after a change.
ALTER TABLE "users"
  ADD COLUMN "terms_version" TEXT,
  ADD COLUMN "terms_accepted_at" TIMESTAMPTZ(3);

ALTER TABLE "legal_acceptances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "legal_acceptances" FORCE ROW LEVEL SECURITY;
CREATE POLICY "legal_acceptances_own" ON "legal_acceptances" FOR SELECT
  USING ("user_id" = current_setting('app.current_user_id', true)::uuid);
GRANT SELECT ON "legal_acceptances" TO wusool_app;
GRANT SELECT, INSERT ON "legal_acceptances" TO wusool_system;

CREATE TRIGGER legal_acceptances_append_only BEFORE UPDATE OR DELETE ON "legal_acceptances"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_mutation();
CREATE TRIGGER legal_acceptances_no_truncate BEFORE TRUNCATE ON "legal_acceptances"
  FOR EACH STATEMENT EXECUTE FUNCTION app_forbid_mutation();
