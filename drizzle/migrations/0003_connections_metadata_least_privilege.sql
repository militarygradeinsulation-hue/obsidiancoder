-- Connections Hub: enforce least privilege even when project-wide default
-- privileges automatically grant anon/authenticated roles broader table access.
-- RLS alone is not a substitute for limiting SQL privileges.

REVOKE ALL ON TABLE public.connected_accounts FROM anon, authenticated;
GRANT SELECT ON TABLE public.connected_accounts TO authenticated;

-- Tokens and OAuth state must never be accessible through client Data API roles.
REVOKE ALL ON TABLE public.connection_token_vault FROM anon, authenticated;
REVOKE ALL ON TABLE public.connection_oauth_states FROM anon, authenticated;

ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_token_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_oauth_states ENABLE ROW LEVEL SECURITY;
