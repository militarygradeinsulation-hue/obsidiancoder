import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { safeRedirectOr, stashOAuthDest, consumeOAuthDest, type AuthMode } from "@/lib/redirect-safe";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string; mode?: AuthMode } => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
    mode: s.mode === "signup" || s.mode === "signin" ? (s.mode as AuthMode) : undefined,
  }),
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in — Aetheris Obsidian" },
      { name: "description", content: "Sign in or create an account to unlock Aetheris Obsidian." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

function AuthPage() {
  const navigate = useNavigate();
  const { redirect, mode: initialMode } = useSearch({ from: "/auth" });
  const dest = safeRedirectOr(redirect, "/");

  const [mode, setMode] = useState<AuthMode>(initialMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.assign(dest);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evt, session) => {
      if (evt === "SIGNED_IN" && session) window.location.assign(dest);
    });
    return () => sub.subscription.unsubscribe();
  }, [dest, navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === "signup") {
        // Preserve the intended landing after email confirmation as best the
        // integration supports — Supabase appends its tokens to this URL.
        const emailRedirectTo = `${window.location.origin}${dest}`;
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo },
        });
        if (error) throw error;
        setMsg("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Auth failed");
    } finally { setBusy(false); }
  }

  async function handleGoogle() {
    setBusy(true); setMsg(null);
    try {
      // OAuth must return to a public origin route. The auth-state listener
      // above will then forward to the safe internal `dest`.
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw new Error(result.error.message || "Google sign-in failed");
      if (result.redirected) return;
      window.location.assign(dest);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Google sign-in failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-[#050607] flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#c9953d]/30 bg-[#0a0b0d] p-6 shadow-2xl">
        <Link to="/unlock" className="text-xs text-[#B6BCC8] hover:text-[#f2eee7]">← Back</Link>
        <h1 className="mt-2 text-lg font-semibold text-[#f2eee7]">
          {mode === "signin" ? "Sign in to Aetheris Obsidian" : "Create your account"}
        </h1>
        <p className="mt-1 text-xs text-[#B6BCC8]">
          {mode === "signin" ? "Access your builds and Pro subscription." : "Save builds and unlock Obsidian Pro."}
        </p>

        <button
          onClick={handleGoogle}
          disabled={busy}
          className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-md bg-white hover:bg-white/90 text-black text-sm font-medium py-2 disabled:opacity-50"
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.3 30.2 0 24 0 14.6 0 6.5 5.4 2.5 13.3l7.8 6C12.3 13.2 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.2-3.2-.5-4.7H24v9h12.7c-.6 3-2.4 5.6-5 7.3l7.7 6c4.5-4.2 7.1-10.3 7.1-17.6z"/><path fill="#FBBC05" d="M10.3 28.7A14.5 14.5 0 019.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 000 24c0 3.9.9 7.6 2.5 10.9l7.8-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.8 2.3-8.2 2.3-6.4 0-11.7-3.7-13.7-9.1l-7.8 6.2C6.5 42.6 14.6 48 24 48z"/></svg>
          Continue with Google
        </button>

        <div className="my-4 flex items-center gap-2 text-[10px] text-[#B6BCC8]/60">
          <div className="h-px flex-1 bg-white/10" /> OR <div className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={handleEmail} className="space-y-3">
          <input
            type="email" required autoComplete="email" placeholder="you@example.com"
            value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-[#f2eee7] placeholder:text-white/30 focus:outline-none focus:border-[#F4A125]"
          />
          <input
            type="password" required minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="Password (min 6 chars)"
            value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-[#f2eee7] placeholder:text-white/30 focus:outline-none focus:border-[#F4A125]"
          />
          <button
            type="submit" disabled={busy}
            className="w-full py-2 rounded-md bg-[#F4A125] hover:bg-[#DD9324] text-black text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        {msg && <div className="mt-3 text-xs text-amber-300" role="status">{msg}</div>}

        <button
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(null); }}
          className="mt-4 w-full text-xs text-[#B6BCC8] hover:text-[#f2eee7]"
        >
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
