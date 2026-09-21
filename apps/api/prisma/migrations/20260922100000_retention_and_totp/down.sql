REVOKE DELETE ON trip_events, alert_events, audit_logs, alerts, trips, trip_students FROM wusool_system;

CREATE OR REPLACE FUNCTION app_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: table is append-only', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END $$;

ALTER TABLE "users" DROP COLUMN "totp_enabled_at";
