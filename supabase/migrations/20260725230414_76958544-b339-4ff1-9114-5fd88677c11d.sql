CREATE TABLE public.free_build_ledger (
  fingerprint TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox','live')),
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_prefix TEXT,
  PRIMARY KEY (fingerprint, environment)
);

GRANT ALL ON public.free_build_ledger TO service_role;

ALTER TABLE public.free_build_ledger ENABLE ROW LEVEL SECURITY;
-- No policies: table is service-role-only. anon/authenticated cannot reach it via PostgREST.

CREATE INDEX idx_free_build_ledger_used_at ON public.free_build_ledger (used_at DESC);