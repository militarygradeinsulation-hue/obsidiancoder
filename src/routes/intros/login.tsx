import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Mark } from "@/components/intros/shell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/intros/login")({
  head: () => ({ meta: [{ title: "Aetheris Intros — Log in" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      if (tab === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/intros" });
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setNotice("Account created. Check your email to confirm, then log in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-constellation flex min-h-screen flex-col items-center justify-center px-6">
      <Link to="/intros" className="mb-8 flex items-center gap-2.5" aria-label="Aetheris Intros">
        <Mark size={30} />
        <span className="leading-tight">
          <span className="block text-sm font-semibold tracking-wide">AETHERIS</span>
          <span className="block text-[10px] tracking-[0.2em] text-muted-foreground">INTROS</span>
        </span>
      </Link>

      <div className="glass-panel w-full max-w-sm p-6">
        <div className="mb-5 flex gap-1 rounded-md bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setTab("signin")}
            className={`flex-1 rounded-md py-1.5 text-[13px] transition ${
              tab === "signin" ? "bg-white/10 text-foreground" : "text-muted-foreground"
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => setTab("signup")}
            className={`flex-1 rounded-md py-1.5 text-[13px] transition ${
              tab === "signup" ? "bg-white/10 text-foreground" : "text-muted-foreground"
            }`}
          >
            Create account
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="text-[12px]">
            <span className="mb-1.5 block text-muted-foreground">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-white/5 px-3 text-[13px] outline-none focus:border-primary/50"
              autoComplete="email"
            />
          </label>
          <label className="text-[12px]">
            <span className="mb-1.5 block text-muted-foreground">Password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-white/5 px-3 text-[13px] outline-none focus:border-primary/50"
              autoComplete={tab === "signin" ? "current-password" : "new-password"}
            />
          </label>

          {error && <p className="text-[12px] text-red-400">{error}</p>}
          {notice && <p className="text-[12px] text-emerald-400">{notice}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-1.5 flex items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-[13px] font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Please wait…" : tab === "signin" ? "Log in" : "Create account"}
            {!loading && <ArrowRight className="h-3.5 w-3.5" />}
          </button>
        </form>
      </div>

      <Link
        to="/intros"
        className="mt-6 text-[12px] text-muted-foreground hover:text-foreground transition"
      >
        ← Back
      </Link>
    </div>
  );
}
