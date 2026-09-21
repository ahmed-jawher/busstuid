-- Reverts 20260921000000_init: removes every object it created.
-- Roles are cluster-wide and may be shared by other databases, so they are left in place.
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
