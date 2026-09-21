-- Initial schema (PLAN §10). Generated DDL first, hand-written security after it.
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('platform_admin', 'org_admin', 'driver', 'attendant', 'guardian');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('school', 'transport_company', 'independent_driver');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('pending_review', 'active', 'suspended');

-- CreateEnum
CREATE TYPE "Country" AS ENUM ('BH', 'SA');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('ar', 'en');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'deleted');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'revoked');

-- CreateEnum
CREATE TYPE "EmailCodePurpose" AS ENUM ('verify_email', 'reset_password', 'change_email');

-- CreateEnum
CREATE TYPE "PushProvider" AS ENUM ('webpush', 'fcm', 'apns');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('web', 'android', 'ios');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "OrgStudentStatus" AS ENUM ('active', 'removed');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('bus', 'van', 'car');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "TripDirection" AS ENUM ('to_school', 'to_home');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('scheduled', 'in_progress', 'overdue', 'completed', 'completed_with_alert', 'cancelled');

-- CreateEnum
CREATE TYPE "TripEndType" AS ENUM ('normal', 'forced');

-- CreateEnum
CREATE TYPE "TripStudentStatus" AS ENUM ('expected', 'boarded', 'alighted', 'absent', 'missing', 'resolved');

-- CreateEnum
CREATE TYPE "TripEventType" AS ENUM ('board', 'alight', 'absent', 'undo');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('student_left_onboard', 'trip_overdue', 'driver_device_silent', 'unexpected_student');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('low', 'high', 'critical');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('open', 'acknowledged', 'resolved');

-- CreateEnum
CREATE TYPE "AlertAction" AS ENUM ('opened', 'escalated', 'acknowledged', 'resolved', 'notified');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('normal', 'high', 'critical');

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('push');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('queued', 'sent', 'failed');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "country" "Country" NOT NULL,
    "timezone" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "status" "OrganizationStatus" NOT NULL DEFAULT 'pending_review',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(3),
    "phone_e164" TEXT NOT NULL,
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "full_name_ar" TEXT NOT NULL,
    "full_name_en" TEXT,
    "password_hash" TEXT NOT NULL,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "totp_secret_encrypted" TEXT,
    "preferred_locale" "Locale" NOT NULL DEFAULT 'ar',
    "mute_routine_notifications" BOOLEAN NOT NULL DEFAULT false,
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "EmailCodePurpose" NOT NULL,
    "target_email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_ip" TEXT,

    CONSTRAINT "email_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("user_id","organization_id","role")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "PushProvider" NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "endpoint" TEXT,
    "p256dh" TEXT,
    "auth_secret" TEXT,
    "native_token" TEXT,
    "user_agent" TEXT,
    "last_test_ok_at" TIMESTAMPTZ(3),
    "last_success_at" TIMESTAMPTZ(3),
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_at" TIMESTAMPTZ(3),
    "device_info" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "created_by_guardian_id" UUID NOT NULL,
    "full_name_ar" TEXT NOT NULL,
    "full_name_en" TEXT,
    "date_of_birth" DATE NOT NULL,
    "photo_version" INTEGER NOT NULL DEFAULT 0,
    "school_name" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_photos" (
    "student_id" UUID NOT NULL,
    "content" BYTEA NOT NULL,
    "mime_type" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_photos_pkey" PRIMARY KEY ("student_id")
);

-- CreateTable
CREATE TABLE "student_guardians" (
    "student_id" UUID NOT NULL,
    "guardian_user_id" UUID NOT NULL,
    "relationship" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("student_id","guardian_user_id")
);

-- CreateTable
CREATE TABLE "enrollment_requests" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_students" (
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "OrgStudentStatus" NOT NULL DEFAULT 'active',
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),

    CONSTRAINT "org_students_pkey" PRIMARY KEY ("organization_id","student_id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "guardian_user_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMPTZ(3),

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plate_number" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "direction" "TripDirection" NOT NULL,
    "default_vehicle_id" UUID,
    "default_driver_id" UUID,
    "planned_start" TEXT NOT NULL,
    "planned_end" TEXT NOT NULL,
    "days_of_week" INTEGER[],
    "status" "RecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_stops" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_students" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "stop_id" UUID NOT NULL,
    "active_from" DATE NOT NULL,
    "active_to" DATE,

    CONSTRAINT "route_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "route_id" UUID,
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "direction" "TripDirection" NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'scheduled',
    "service_date" DATE NOT NULL,
    "planned_start_at" TIMESTAMPTZ(3) NOT NULL,
    "planned_end_at" TIMESTAMPTZ(3) NOT NULL,
    "started_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "end_type" "TripEndType",
    "force_reason" TEXT,
    "empty_confirmed_at" TIMESTAMPTZ(3),
    "last_heartbeat_at" TIMESTAMPTZ(3),
    "last_device_state" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_students" (
    "organization_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "stop_id" UUID,
    "stop_sequence" INTEGER,
    "status" "TripStudentStatus" NOT NULL DEFAULT 'expected',
    "is_unexpected" BOOLEAN NOT NULL DEFAULT false,
    "boarded_at" TIMESTAMPTZ(3),
    "alighted_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trip_students_pkey" PRIMARY KEY ("trip_id","student_id")
);

-- CreateTable
CREATE TABLE "trip_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "event_type" "TripEventType" NOT NULL,
    "undoes_event_id" UUID,
    "recorded_by" UUID NOT NULL,
    "client_event_id" TEXT NOT NULL,
    "client_recorded_at" TIMESTAMPTZ(3) NOT NULL,
    "server_received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "accuracy_m" DECIMAL(8,2),

    CONSTRAINT "trip_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "student_id" UUID,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'open',
    "escalation_level" INTEGER NOT NULL DEFAULT 0,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "next_escalation_at" TIMESTAMPTZ(3),
    "acknowledged_at" TIMESTAMPTZ(3),
    "acknowledged_by" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "resolved_by" UUID,
    "resolution_reason" TEXT,
    "resolution_note" TEXT,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "alert_id" UUID NOT NULL,
    "action" "AlertAction" NOT NULL,
    "actor_user_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "alert_id" UUID,
    "template_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "priority" "NotificationPriority" NOT NULL DEFAULT 'normal',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "push_subscription_id" UUID,
    "channel" "DeliveryChannel" NOT NULL DEFAULT 'push',
    "status" "DeliveryStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "organization_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "diff" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_phone_e164_idx" ON "users"("phone_e164");

-- CreateIndex
CREATE INDEX "email_codes_user_id_purpose_created_at_idx" ON "email_codes"("user_id", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "email_codes_target_email_created_at_idx" ON "email_codes"("target_email", "created_at");

-- CreateIndex
CREATE INDEX "memberships_organization_id_role_idx" ON "memberships"("organization_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_native_token_key" ON "push_subscriptions"("native_token");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "student_guardians_guardian_user_id_idx" ON "student_guardians"("guardian_user_id");

-- CreateIndex
CREATE INDEX "enrollment_requests_organization_id_status_idx" ON "enrollment_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "enrollment_requests_student_id_idx" ON "enrollment_requests"("student_id");

-- CreateIndex
CREATE INDEX "org_students_student_id_idx" ON "org_students"("student_id");

-- CreateIndex
CREATE INDEX "consents_student_id_idx" ON "consents"("student_id");

-- CreateIndex
CREATE INDEX "vehicles_organization_id_idx" ON "vehicles"("organization_id");

-- CreateIndex
CREATE INDEX "routes_organization_id_idx" ON "routes"("organization_id");

-- CreateIndex
CREATE INDEX "route_stops_route_id_sequence_idx" ON "route_stops"("route_id", "sequence");

-- CreateIndex
CREATE INDEX "route_students_route_id_idx" ON "route_students"("route_id");

-- CreateIndex
CREATE INDEX "route_students_student_id_idx" ON "route_students"("student_id");

-- CreateIndex
CREATE INDEX "trips_organization_id_service_date_idx" ON "trips"("organization_id", "service_date");

-- CreateIndex
CREATE INDEX "trips_driver_id_service_date_idx" ON "trips"("driver_id", "service_date");

-- CreateIndex
CREATE INDEX "trips_status_idx" ON "trips"("status");

-- CreateIndex
CREATE UNIQUE INDEX "trips_route_id_service_date_key" ON "trips"("route_id", "service_date");

-- CreateIndex
CREATE INDEX "trip_students_student_id_idx" ON "trip_students"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_events_client_event_id_key" ON "trip_events"("client_event_id");

-- CreateIndex
CREATE INDEX "trip_events_trip_id_client_recorded_at_idx" ON "trip_events"("trip_id", "client_recorded_at");

-- CreateIndex
CREATE INDEX "alerts_organization_id_status_idx" ON "alerts"("organization_id", "status");

-- CreateIndex
CREATE INDEX "alerts_status_next_escalation_at_idx" ON "alerts"("status", "next_escalation_at");

-- CreateIndex
CREATE INDEX "alerts_trip_id_idx" ON "alerts"("trip_id");

-- CreateIndex
CREATE INDEX "alert_events_alert_id_created_at_idx" ON "alert_events"("alert_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_deliveries_notification_id_idx" ON "notification_deliveries"("notification_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries"("status");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_photos" ADD CONSTRAINT "student_photos_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_user_id_fkey" FOREIGN KEY ("guardian_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_requests" ADD CONSTRAINT "enrollment_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_requests" ADD CONSTRAINT "enrollment_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_students" ADD CONSTRAINT "org_students_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_students" ADD CONSTRAINT "org_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_guardian_user_id_fkey" FOREIGN KEY ("guardian_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_default_vehicle_id_fkey" FOREIGN KEY ("default_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_students" ADD CONSTRAINT "route_students_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_students" ADD CONSTRAINT "route_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_students" ADD CONSTRAINT "route_students_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "route_stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_students" ADD CONSTRAINT "trip_students_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_students" ADD CONSTRAINT "trip_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_students" ADD CONSTRAINT "trip_students_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "route_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_push_subscription_id_fkey" FOREIGN KEY ("push_subscription_id") REFERENCES "push_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ═════════════════════════════════════════════════════════════════════════════
-- Hand-written part (PLAN §10): roles, constraints, append-only triggers, RLS.
-- ═════════════════════════════════════════════════════════════════════════════

-- Database roles. Created without LOGIN here; `pnpm --filter @wusool/api db:roles` gives them
-- LOGIN and a password. wusool_app serves requests and is subject to RLS; wusool_system is used
-- for sign-in flows and background jobs and bypasses RLS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wusool_app') THEN
    CREATE ROLE wusool_app NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wusool_system') THEN
    CREATE ROLE wusool_system NOLOGIN BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO wusool_app, wusool_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO wusool_app, wusool_system;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO wusool_app, wusool_system;
-- Prisma's bookkeeping table exists under `migrate deploy` but not in a shadow database.
DO $$
BEGIN
  IF to_regclass('_prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE "_prisma_migrations" FROM wusool_app, wusool_system;
  END IF;
END $$;

-- ─── Constraints ─────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
  ADD CONSTRAINT users_phone_e164 CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,14}$');

ALTER TABLE routes
  ADD CONSTRAINT routes_planned_start_hhmm CHECK (planned_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT routes_planned_end_hhmm CHECK (planned_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT routes_days_of_week CHECK (days_of_week <@ ARRAY[1, 2, 3, 4, 5, 6, 7]);

ALTER TABLE vehicles ADD CONSTRAINT vehicles_capacity_positive CHECK (capacity > 0);

ALTER TABLE student_photos
  ADD CONSTRAINT student_photos_size CHECK (bytes > 0 AND bytes <= 150000);

ALTER TABLE trip_events
  ADD CONSTRAINT trip_events_undo_target CHECK ((event_type = 'undo') = (undoes_event_id IS NOT NULL));

ALTER TABLE trips
  ADD CONSTRAINT trips_forced_needs_reason CHECK (end_type IS DISTINCT FROM 'forced' OR force_reason IS NOT NULL);

-- One active trip per vehicle (PLAN §6.1).
CREATE UNIQUE INDEX one_active_trip_per_vehicle ON trips (vehicle_id)
  WHERE status IN ('in_progress', 'overdue');

-- At most one pending enrollment request per student and organisation.
CREATE UNIQUE INDEX one_pending_enrollment ON enrollment_requests (student_id, organization_id)
  WHERE status = 'pending';

-- ─── Append-only tables (PLAN §3.2) ──────────────────────────────────────────

CREATE FUNCTION app_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: table is append-only', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER trip_events_append_only BEFORE UPDATE OR DELETE ON trip_events
  FOR EACH ROW EXECUTE FUNCTION app_forbid_mutation();
CREATE TRIGGER trip_events_no_truncate BEFORE TRUNCATE ON trip_events
  FOR EACH STATEMENT EXECUTE FUNCTION app_forbid_mutation();
CREATE TRIGGER alert_events_append_only BEFORE UPDATE OR DELETE ON alert_events
  FOR EACH ROW EXECUTE FUNCTION app_forbid_mutation();
CREATE TRIGGER alert_events_no_truncate BEFORE TRUNCATE ON alert_events
  FOR EACH STATEMENT EXECUTE FUNCTION app_forbid_mutation();
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION app_forbid_mutation();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION app_forbid_mutation();
-- Alerts change status but are never deleted.
CREATE TRIGGER alerts_no_delete BEFORE DELETE ON alerts
  FOR EACH ROW EXECUTE FUNCTION app_forbid_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON trip_events, alert_events, audit_logs FROM wusool_app, wusool_system;
REVOKE DELETE, TRUNCATE ON alerts, trips, trip_students FROM wusool_app, wusool_system;

-- ─── Row Level Security (PLAN §10) ───────────────────────────────────────────
-- The API sets these per transaction:  set_config('app.current_org_id', …, true)
--                                       set_config('app.current_user_id', …, true)

CREATE FUNCTION app_current_org() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.current_org_id', true), '')::uuid $$;

CREATE FUNCTION app_current_user() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.current_user_id', true), '')::uuid $$;

-- SECURITY DEFINER helpers read the link tables without recursing into their own policies.
CREATE FUNCTION app_is_guardian_of(p_student uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM student_guardians
     WHERE student_id = p_student AND guardian_user_id = app_current_user()
  )
$$;

CREATE FUNCTION app_org_has_student(p_student uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_students
     WHERE organization_id = app_current_org() AND student_id = p_student AND status = 'active'
  )
$$;

CREATE FUNCTION app_guardian_can_see_trip(p_trip uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_students ts
      JOIN student_guardians sg ON sg.student_id = ts.student_id
     WHERE ts.trip_id = p_trip AND sg.guardian_user_id = app_current_user()
  )
$$;

CREATE FUNCTION app_org_can_see_user(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
     WHERE user_id = p_user AND organization_id = app_current_org() AND status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM student_guardians sg
      JOIN org_students os ON os.student_id = sg.student_id
     WHERE sg.guardian_user_id = p_user
       AND os.organization_id = app_current_org() AND os.status = 'active'
  )
$$;

REVOKE ALL ON FUNCTION app_is_guardian_of(uuid), app_org_has_student(uuid),
  app_guardian_can_see_trip(uuid), app_org_can_see_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_current_org(), app_current_user(), app_is_guardian_of(uuid),
  app_org_has_student(uuid), app_guardian_can_see_trip(uuid), app_org_can_see_user(uuid)
  TO wusool_app, wusool_system;

-- Enable + force RLS everywhere. Tables without a policy for wusool_app are system-only.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations', 'users', 'email_codes', 'memberships', 'push_subscriptions', 'refresh_tokens',
    'students', 'student_photos', 'student_guardians', 'enrollment_requests', 'org_students',
    'consents', 'vehicles', 'routes', 'route_stops', 'route_students', 'trips', 'trip_students',
    'trip_events', 'alerts', 'alert_events', 'notifications', 'notification_deliveries', 'audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Organisation-scoped operational tables: full access inside the current organisation.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vehicles', 'routes', 'route_stops', 'route_students', 'trips', 'trip_students',
    'trip_events', 'alerts', 'alert_events', 'org_students'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I TO wusool_app USING (organization_id = app_current_org()) '
      'WITH CHECK (organization_id = app_current_org())',
      t || '_org', t);
  END LOOP;
END $$;

-- Guardians: read-only visibility of their own children's operational data.
CREATE POLICY trip_students_guardian ON trip_students FOR SELECT TO wusool_app
  USING (app_is_guardian_of(student_id));
CREATE POLICY trip_events_guardian ON trip_events FOR SELECT TO wusool_app
  USING (app_is_guardian_of(student_id));
CREATE POLICY trips_guardian ON trips FOR SELECT TO wusool_app
  USING (app_guardian_can_see_trip(id));
CREATE POLICY vehicles_guardian ON vehicles FOR SELECT TO wusool_app
  USING (EXISTS (SELECT 1 FROM trips t WHERE t.vehicle_id = vehicles.id AND app_guardian_can_see_trip(t.id)));
CREATE POLICY route_students_guardian ON route_students FOR SELECT TO wusool_app
  USING (app_is_guardian_of(student_id));
CREATE POLICY route_stops_guardian ON route_stops FOR SELECT TO wusool_app
  USING (EXISTS (SELECT 1 FROM route_students rs WHERE rs.stop_id = route_stops.id AND app_is_guardian_of(rs.student_id)));
CREATE POLICY alerts_guardian ON alerts FOR SELECT TO wusool_app
  USING (student_id IS NOT NULL AND app_is_guardian_of(student_id));
CREATE POLICY org_students_guardian ON org_students FOR SELECT TO wusool_app
  USING (app_is_guardian_of(student_id));

-- Organisations: members see theirs; admins update the current one. Creation is system-only.
CREATE POLICY organizations_member ON organizations FOR SELECT TO wusool_app
  USING (
    id = app_current_org()
    OR EXISTS (SELECT 1 FROM memberships m
                WHERE m.organization_id = organizations.id
                  AND m.user_id = app_current_user() AND m.status = 'active')
  );
-- Active organisations are public directory entries; guardians also see any organisation their
-- child has a request with, whatever its status.
CREATE POLICY organizations_visible ON organizations FOR SELECT TO wusool_app
  USING (
    (status = 'active' AND deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM enrollment_requests er
                WHERE er.organization_id = organizations.id AND app_is_guardian_of(er.student_id))
  );
CREATE POLICY organizations_update ON organizations FOR UPDATE TO wusool_app
  USING (id = app_current_org()) WITH CHECK (id = app_current_org());

CREATE POLICY memberships_scope ON memberships TO wusool_app
  USING (organization_id = app_current_org() OR user_id = app_current_user())
  WITH CHECK (organization_id = app_current_org());

-- Users: yourself, members of your organisation, and guardians of its students.
CREATE POLICY users_visible ON users FOR SELECT TO wusool_app
  USING (id = app_current_user() OR app_org_can_see_user(id));
CREATE POLICY users_self_update ON users FOR UPDATE TO wusool_app
  USING (id = app_current_user()) WITH CHECK (id = app_current_user());

CREATE POLICY push_subscriptions_owner ON push_subscriptions TO wusool_app
  USING (user_id = app_current_user()) WITH CHECK (user_id = app_current_user());

-- Students: guardians own them; an organisation sees them only after approval (PLAN §5).
CREATE POLICY students_select ON students FOR SELECT TO wusool_app
  USING (created_by_guardian_id = app_current_user() OR app_is_guardian_of(id) OR app_org_has_student(id));
CREATE POLICY students_insert ON students FOR INSERT TO wusool_app
  WITH CHECK (created_by_guardian_id = app_current_user());
CREATE POLICY students_update ON students FOR UPDATE TO wusool_app
  USING (app_is_guardian_of(id)) WITH CHECK (app_is_guardian_of(id));

CREATE POLICY student_photos_select ON student_photos FOR SELECT TO wusool_app
  USING (app_is_guardian_of(student_id) OR app_org_has_student(student_id));
CREATE POLICY student_photos_write ON student_photos FOR ALL TO wusool_app
  USING (app_is_guardian_of(student_id)) WITH CHECK (app_is_guardian_of(student_id));

CREATE POLICY student_guardians_select ON student_guardians FOR SELECT TO wusool_app
  USING (guardian_user_id = app_current_user() OR app_org_has_student(student_id));
CREATE POLICY student_guardians_self ON student_guardians FOR INSERT TO wusool_app
  WITH CHECK (
    guardian_user_id = app_current_user()
    AND EXISTS (SELECT 1 FROM students s
                 WHERE s.id = student_id AND s.created_by_guardian_id = app_current_user())
  );

CREATE POLICY enrollment_requests_select ON enrollment_requests FOR SELECT TO wusool_app
  USING (organization_id = app_current_org() OR app_is_guardian_of(student_id));
CREATE POLICY enrollment_requests_insert ON enrollment_requests FOR INSERT TO wusool_app
  WITH CHECK (requested_by = app_current_user() AND app_is_guardian_of(student_id));
CREATE POLICY enrollment_requests_decide ON enrollment_requests FOR UPDATE TO wusool_app
  USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());

CREATE POLICY consents_owner ON consents TO wusool_app
  USING (guardian_user_id = app_current_user()) WITH CHECK (guardian_user_id = app_current_user());

CREATE POLICY notifications_owner ON notifications FOR SELECT TO wusool_app
  USING (user_id = app_current_user());
CREATE POLICY notifications_mark_read ON notifications FOR UPDATE TO wusool_app
  USING (user_id = app_current_user()) WITH CHECK (user_id = app_current_user());

CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO wusool_app WITH CHECK (true);
CREATE POLICY audit_logs_org_read ON audit_logs FOR SELECT TO wusool_app
  USING (organization_id = app_current_org());

-- email_codes, refresh_tokens and notification_deliveries have no wusool_app policy: system only.
