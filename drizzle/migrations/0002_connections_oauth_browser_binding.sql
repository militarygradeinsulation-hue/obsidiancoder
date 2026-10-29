ALTER TABLE public.connection_oauth_states ADD COLUMN IF NOT EXISTS binding_hash text;
COMMENT ON COLUMN public.connection_oauth_states.binding_hash IS 'SHA-256 of the browser-bound nonce cookie + state; required to consume the state.';

-- New consumer: requires the browser binding hash. Deletes only on full match, so a
-- leaked authorize URL opened in another browser cannot consume or bind the state.
CREATE OR REPLACE FUNCTION public.consume_connection_oauth_state_v2(_state_hash text, _provider text, _binding_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid;
  _expires_at timestamptz;
BEGIN
  IF _state_hash IS NULL OR _provider IS NULL OR _binding_hash IS NULL
     OR length(_state_hash) <> 64 OR length(_binding_hash) <> 64 THEN
    RETURN NULL;
  END IF;

  DELETE FROM public.connection_oauth_states AS s
   WHERE s.state_hash = _state_hash
     AND s.provider = _provider
     AND s.binding_hash IS NOT NULL
     AND s.binding_hash = _binding_hash
  RETURNING s.user_id, s.expires_at INTO _uid, _expires_at;

  DELETE FROM public.connection_oauth_states AS o
   WHERE o.expires_at < pg_catalog.now() - interval '1 hour';

  IF _uid IS NULL OR _expires_at IS NULL OR _expires_at <= pg_catalog.now() THEN
    RETURN NULL;
  END IF;
  RETURN _uid;
END
$$;
REVOKE ALL ON FUNCTION public.consume_connection_oauth_state_v2(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_connection_oauth_state_v2(text, text, text) TO service_role;

-- Old unbound consumer: retired and made fail-closed so no caller can bind a
-- state without the browser cookie. Kept (not dropped) for the deployed build.
CREATE OR REPLACE FUNCTION public.consume_connection_oauth_state(_state_hash text, _provider text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION public.consume_connection_oauth_state(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_connection_oauth_state(text, text) TO service_role;
COMMENT ON FUNCTION public.consume_connection_oauth_state(text, text) IS 'DEPRECATED: unbound state consumer; always returns NULL. Use consume_connection_oauth_state_v2.';

-- Invalidate any pending unbound states created before this fix.
DELETE FROM public.connection_oauth_states WHERE binding_hash IS NULL;