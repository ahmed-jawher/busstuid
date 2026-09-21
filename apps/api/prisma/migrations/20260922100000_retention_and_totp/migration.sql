-- Optional TOTP for admins (PLAN §5.1).
ALTER TABLE "users" ADD COLUMN "totp_enabled_at" TIMESTAMPTZ(3);

-- Retention (PLAN §14): append-only tables may lose rows only through the scheduled retention
-- job — running as wusool_system with the transaction-local flag app.retention_purge = 'on'.
-- Updates and TRUNCATE stay forbidden for everyone, and no other role can delete.
CREATE OR REPLACE FUNCTION app_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_user = 'wusool_system'
     AND current_setting('app.retention_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% on % is not allowed: table is append-only', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END $$;

GRANT DELETE ON trip_events, alert_events, audit_logs, alerts, trips, trip_students TO wusool_system;
