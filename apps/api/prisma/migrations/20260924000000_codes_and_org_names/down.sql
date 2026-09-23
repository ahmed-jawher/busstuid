DROP INDEX "users_public_code_key";
DROP INDEX "students_public_code_key";
ALTER TABLE "users" DROP COLUMN "public_code";
ALTER TABLE "students" DROP COLUMN "public_code";

DROP INDEX "organizations_country_type_name_key_en_key";
DROP INDEX "organizations_country_type_name_key_ar_key";
ALTER TABLE "organizations" DROP COLUMN "name_key_en", DROP COLUMN "name_key_ar";
ALTER TABLE "organizations" ALTER COLUMN "name_en" DROP NOT NULL;

-- PostgreSQL cannot remove a value from an enum: rebuild the type without 'kindergarten'.
ALTER TABLE "organizations" ALTER COLUMN "type" TYPE TEXT;
UPDATE "organizations" SET "type" = 'school' WHERE "type" = 'kindergarten';
DROP TYPE "OrganizationType";
CREATE TYPE "OrganizationType" AS ENUM ('school', 'transport_company', 'independent_driver');
ALTER TABLE "organizations"
  ALTER COLUMN "type" TYPE "OrganizationType" USING "type"::"OrganizationType";
