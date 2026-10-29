CREATE TABLE public.connected_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  provider_account_id text NOT NULL,
  login text,
  display_name text,
  avatar_url text,
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'connected',
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
GRANT SELECT ON public.connected_accounts TO authenticated;
GRANT ALL ON public.connected_accounts TO service_role;
ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their connected accounts" ON public.connected_accounts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.connection_token_vault (
  user_id uuid NOT NULL,
  provider text NOT NULL,
  ciphertext text NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);
REVOKE ALL ON public.connection_token_vault FROM anon, authenticated;
GRANT ALL ON public.connection_token_vault TO service_role;
ALTER TABLE public.connection_token_vault ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.connection_oauth_states (
  state_hash text PRIMARY KEY,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX connection_oauth_states_user_idx ON public.connection_oauth_states (user_id, created_at);
REVOKE ALL ON public.connection_oauth_states FROM anon, authenticated;
GRANT ALL ON public.connection_oauth_states TO service_role;
ALTER TABLE public.connection_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_connection_oauth_state(_state_hash text, _provider text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  DELETE FROM public.connection_oauth_states
   WHERE state_hash = _state_hash AND provider = _provider
   RETURNING user_id, expires_at INTO _uid, _state_hash;
  IF _uid IS NULL THEN RETURN NULL; END IF;
  IF _state_hash::timestamptz < now() THEN RETURN NULL; END IF;
  DELETE FROM public.connection_oauth_states WHERE expires_at < now() - interval '1 hour';
  RETURN _uid;
END $$;
REVOKE ALL ON FUNCTION public.consume_connection_oauth_state(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_connection_oauth_state(text, text) TO service_role;