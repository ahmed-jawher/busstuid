-- Account type chosen at sign-up, and the organisation to create after email verification.
CREATE TYPE "SignupRole" AS ENUM ('guardian', 'independent_driver', 'organization', 'staff_driver');

ALTER TABLE "users"
  ADD COLUMN "signup_role" "SignupRole" NOT NULL DEFAULT 'guardian',
  ADD COLUMN "pending_organization" JSONB;
