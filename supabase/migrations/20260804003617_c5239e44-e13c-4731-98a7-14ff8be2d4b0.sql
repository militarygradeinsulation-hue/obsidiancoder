REVOKE EXECUTE ON FUNCTION public.project_sync_set_cloud_memory(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.build_memory_lookup(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.build_memory_list(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.build_memory_upsert(uuid, uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.build_memory_delete(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.build_memory_reset(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.build_memory_stats(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.project_sync_set_cloud_memory(uuid, uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.build_memory_lookup(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.build_memory_list(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.build_memory_upsert(uuid, uuid, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.build_memory_delete(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.build_memory_reset(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.build_memory_stats(uuid, uuid) TO service_role;