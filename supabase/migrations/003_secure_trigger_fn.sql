-- SP-2 Security Fix: restrict handle_new_owner external execution
-- handle_new_owner is SECURITY DEFINER and must not be callable via /rest/v1/rpc
-- Trigger fires independently of EXECUTE grants — owners row creation is unaffected.

REVOKE EXECUTE ON FUNCTION public.handle_new_owner() FROM PUBLIC, anon, authenticated;

-- schema_version bump
INSERT INTO app_meta (key, value)
VALUES ('schema_version', '003')
ON CONFLICT (key) DO UPDATE SET value = '003';
