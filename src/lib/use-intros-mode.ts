import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type IntrosMode = "demo" | "live" | null;

const DEMO_KEY = "intros-demo-mode";

function readDemoFlag() {
  try {
    return localStorage.getItem(DEMO_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Drives the Intros section's demo/live split. "Live" means a real Supabase
 * session exists — no mock data is ever shown. "Demo" is an explicit,
 * unauthenticated opt-in (localStorage flag) that shows the seeded mock
 * network, with the account identity kept generic so it never reads as a
 * real person's live account.
 */
export function useIntrosMode() {
  const [mode, setMode] = useState<IntrosMode | "loading">("loading");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session?.user) {
        setUser(data.session.user);
        setMode("live");
      } else {
        setMode(readDemoFlag() ? "demo" : null);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        try {
          localStorage.removeItem(DEMO_KEY);
        } catch {
          /* ignore */
        }
        setUser(session.user);
        setMode("live");
      } else {
        setUser(null);
        setMode(readDemoFlag() ? "demo" : null);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const enterDemo = () => {
    try {
      localStorage.setItem(DEMO_KEY, "1");
    } catch {
      /* ignore */
    }
    setMode("demo");
  };

  const exitDemo = () => {
    try {
      localStorage.removeItem(DEMO_KEY);
    } catch {
      /* ignore */
    }
    setMode(null);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setMode(null);
  };

  return { mode, user, enterDemo, exitDemo, signOut };
}
