-- Reverse the October 2026 provider rename so a build from before it can start.
--
-- That migration renamed providers 'azure' → 'cloud' and 'local' → 'logos-local'
-- and added 'morpheus'. Older builds re-create CHECK constraints that only allow
-- 'azure' and 'local', so their schema init fails on migrated data.
--
-- Procedure:
--   1. Stop the new app:   kubectl scale deployment/proposal-checker -n proposal-checker --replicas=0
--   2. Wait until no app pod is left (a running pod could still write new provider
--      values, which the restored CHECKs reject). Abort if this times out:
--        kubectl wait --for=delete pod -n proposal-checker --timeout=300s \
--          -l app.kubernetes.io/instance=proposal-checker,app.kubernetes.io/component=app
--        kubectl get pods -n proposal-checker \
--          -l app.kubernetes.io/instance=proposal-checker,app.kubernetes.io/component=app
--      The last command must print "No resources found".
--   3. Run this script:    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/rollback-provider-rename.sql
--   4. Deploy the old image and its old Helm values (AZURE_OPENAI_* / LOCAL_LLM_*).
--   5. Start it again:     kubectl scale deployment/proposal-checker -n proposal-checker --replicas=1
--
-- Morpheus has no equivalent in old builds; its rows become 'local'.
-- Note: on startup, old builds set a role whose list is exactly ['local'] to
-- ['azure', 'local'] (August 2026 rollout update). Re-check role config afterwards.

BEGIN;

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_provider_check;
UPDATE reviews
  SET provider = CASE provider WHEN 'cloud' THEN 'azure' ELSE 'local' END
  WHERE provider IN ('cloud', 'logos-local', 'morpheus');
ALTER TABLE reviews ADD CONSTRAINT reviews_provider_check
  CHECK (provider IN ('azure', 'local'));

-- Every element maps to 'azure' or 'local', so no array becomes empty.
ALTER TABLE role_provider_config DROP CONSTRAINT IF EXISTS role_provider_config_providers_check;
UPDATE role_provider_config
  SET providers = ARRAY(
        SELECT DISTINCT CASE p WHEN 'cloud' THEN 'azure' ELSE 'local' END
        FROM unnest(providers) AS p
        ORDER BY 1
      ),
      updated_at = NOW()
  WHERE providers && ARRAY['cloud', 'logos-local', 'morpheus']::text[];
ALTER TABLE role_provider_config ADD CONSTRAINT role_provider_config_providers_check
  CHECK (cardinality(providers) > 0 AND providers <@ ARRAY['azure', 'local']::text[]);

UPDATE token_usage
  SET provider = CASE provider WHEN 'cloud' THEN 'azure' ELSE 'local' END
  WHERE provider IN ('cloud', 'logos-local', 'morpheus');

ALTER TABLE review_schedules ALTER COLUMN provider SET DEFAULT 'azure';
UPDATE review_schedules
  SET provider = CASE provider WHEN 'cloud' THEN 'azure' ELSE 'local' END
  WHERE provider IN ('cloud', 'logos-local', 'morpheus');

COMMIT;
