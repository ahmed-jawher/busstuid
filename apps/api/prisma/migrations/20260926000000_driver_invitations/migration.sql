-- A driver a family already uses who has no account yet (PLAN §5). Nothing is ever sent to the
-- number: the row lets the operator invite that driver, and it turns into an ordinary link request
-- the moment they sign up as an independent driver with the same number.
--
-- `contact_consent_at` and the two columns beside it are the guardian's permission to speak to
-- that driver on their behalf, kept the same way as the other consents (PLAN §14).
CREATE TYPE "DriverInvitationStatus" AS ENUM ('pending', 'linked', 'cancelled');

CREATE TABLE "driver_invitations" (
  "id"                   UUID PRIMARY KEY,
  "student_id"           UUID NOT NULL REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "invited_by"           UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "driver_name"          TEXT NOT NULL,
  "driver_phone_e164"    TEXT NOT NULL,
  "status"               "DriverInvitationStatus" NOT NULL DEFAULT 'pending',
  "contact_consent_at"   TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "policy_version"       TEXT NOT NULL,
  "consent_ip"           TEXT,
  "consent_user_agent"   TEXT,
  "linked_organization_id" UUID REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "linked_at"            TIMESTAMPTZ(3),
  "created_at"           TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

CREATE INDEX "driver_invitations_student_id_idx" ON "driver_invitations" ("student_id");
CREATE INDEX "driver_invitations_invited_by_idx" ON "driver_invitations" ("invited_by");
-- Claimed by phone when a driver signs up, and one child is only waiting for a number once.
CREATE INDEX driver_invitations_waiting ON "driver_invitations" ("driver_phone_e164")
  WHERE "status" = 'pending';
CREATE UNIQUE INDEX one_waiting_invitation_per_driver ON "driver_invitations"
  ("student_id", "driver_phone_e164") WHERE "status" = 'pending';

ALTER TABLE "driver_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "driver_invitations" FORCE ROW LEVEL SECURITY;
-- The guardian who wrote it sees and withdraws it. Nobody else: the driver's number belongs to
-- that family's arrangement, and no organisation is party to it yet.
CREATE POLICY "driver_invitations_guardian" ON "driver_invitations" TO wusool_app
  USING ("invited_by" = app_current_user() AND app_is_guardian_of("student_id"))
  WITH CHECK ("invited_by" = app_current_user() AND app_is_guardian_of("student_id"));
GRANT SELECT, INSERT, UPDATE, DELETE ON "driver_invitations" TO wusool_app, wusool_system;

-- A family that picked the wrong school must be able to take the request back while it is still
-- pending. Approved links are not touched here: those are removed by the organisation.
CREATE POLICY enrollment_requests_guardian_withdraw ON enrollment_requests FOR DELETE TO wusool_app
  USING (status = 'pending' AND requested_by = app_current_user() AND app_is_guardian_of(student_id));
