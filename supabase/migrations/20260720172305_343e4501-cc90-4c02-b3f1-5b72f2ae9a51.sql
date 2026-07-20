-- Drop the legacy 15-argument usage_finalize overload. Keep only the secure 16-argument
-- overload that includes _cap for atomic cap-safe top-ups.
DROP FUNCTION IF EXISTS public.usage_finalize(
  uuid, integer, text, text, text, text, text, integer, integer, integer, integer, numeric, numeric, text, jsonb
);
-- Reassert privileges on the remaining overload just in case.
REVOKE ALL ON FUNCTION public.usage_finalize(
  uuid, integer, text, text, text, text, text, integer, integer, integer, integer, numeric, numeric, text, jsonb, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.usage_finalize(
  uuid, integer, text, text, text, text, text, integer, integer, integer, integer, numeric, numeric, text, jsonb, integer
) TO service_role;