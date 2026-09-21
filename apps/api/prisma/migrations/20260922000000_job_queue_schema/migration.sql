-- Background jobs (PLAN §12) use pg-boss, which keeps its queue in PostgreSQL.
-- It runs as wusool_system and manages its own tables inside this schema, so the application
-- never needs superuser rights at runtime.
CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION wusool_system;

-- Alerts are processed by due time; open ones are scanned every minute.
CREATE INDEX IF NOT EXISTS alerts_due ON alerts (next_escalation_at)
  WHERE status IN ('open', 'acknowledged');

-- Deliveries waiting for (re)sending.
CREATE INDEX IF NOT EXISTS notification_deliveries_pending ON notification_deliveries (updated_at)
  WHERE status IN ('queued', 'failed');
