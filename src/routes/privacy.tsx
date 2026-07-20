import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy Policy — Aetheris Obsidian" },
      { name: "description", content: "How Aetheris Obsidian handles your data, credentials, and AI usage." },
    ],
    links: [{ rel: "canonical", href: "/privacy" }],
  }),
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#050607] text-[#f2eee7] py-16 px-4">
      <article className="mx-auto max-w-2xl">
        <Link to="/unlock" className="text-xs text-[#B6BCC8] hover:text-[#f2eee7]">← Back to access</Link>
        <h1 className="mt-4 font-serif text-3xl text-[#f4a125] tracking-wide">Privacy Policy</h1>
        <p className="mt-1 text-xs text-[#B6BCC8]/70 uppercase tracking-widest">Aetheris Obsidian</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-[#B6BCC8]">
          <section>
            <h2 className="text-[#f2eee7] font-semibold mb-2">Data we collect</h2>
            <p>Account email, authenticated session tokens, and Stripe subscription state (status and billing period). We do not store payment card data — Stripe handles it.</p>
          </section>
          <section>
            <h2 className="text-[#f2eee7] font-semibold mb-2">AI usage</h2>
            <p>When you use cloud AI features, prompts and generated output are transmitted to the selected provider (e.g. OpenAI, Google, Leonardo, Higgsfield) subject to their terms. We record credit accounting metadata (operation, credits used, model, timestamp) to enforce your billing period allowance.</p>
          </section>
          <section>
            <h2 className="text-[#f2eee7] font-semibold mb-2">Local data</h2>
            <p>Local projects, previews, history, screenshots, and deterministic edits stay in your browser and are not transmitted to our servers.</p>
          </section>
          <section>
            <h2 className="text-[#f2eee7] font-semibold mb-2">Cookies</h2>
            <p>We use a single signed session cookie to keep you signed in and, if applicable, to remember that you have entered a valid access code. No tracking or advertising cookies.</p>
          </section>
          <section>
            <h2 className="text-[#f2eee7] font-semibold mb-2">Your controls</h2>
            <p>You can cancel your subscription at any time. To request deletion of your account and associated data, contact support.</p>
          </section>
          <section>
            <h2 className="text-[#f2eee7] font-semibold mb-2">Security</h2>
            <p>Entitlement, credit accounting, and subscription verification are performed server-side. Client-supplied identifiers are never trusted for billing.</p>
          </section>
        </div>
      </article>
    </div>
  );
}
