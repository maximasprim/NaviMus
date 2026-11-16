-- OPTIONAL, run once, on purpose. Makes a tenant's commission setting (and the platform default) actually apply to
-- operators who were never given a rate of their own.
--
-- Why: every operator row was created with commission_rate_percent = '10.00', which looked like an explicit
-- per-operator rate, so it always won over the tenant/platform rate. After this script, operators sitting on the
-- untouched default use the tenant's rate, then the platform default (10 unless changed). Nothing changes today:
-- the platform default is also 10. Operators whose rate was set to anything other than 10.00 are left alone.
BEGIN;
ALTER TABLE operators ALTER COLUMN commission_rate_percent DROP DEFAULT;
UPDATE operators SET commission_rate_percent = NULL WHERE commission_rate_percent = '10.00';
COMMIT;
