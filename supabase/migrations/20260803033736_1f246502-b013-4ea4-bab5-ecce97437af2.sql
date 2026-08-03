REVOKE EXECUTE ON FUNCTION public.project_sync_touch(uuid, uuid, text, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.project_sync_set_memory(uuid, uuid, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.project_sync_set_live(uuid, uuid, boolean, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.project_sync_get(uuid, uuid) FROM anon, authenticated;