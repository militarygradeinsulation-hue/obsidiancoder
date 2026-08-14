import { createFileRoute, Link } from "@tanstack/react-router";
import { PLAN_TIERS } from "@/lib/plans";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms of Service — Aetheris Obsidian" },
      { name: "description", content: "The terms that govern access to and use of Aetheris Obsidian." },
    ],
    links: [{ rel: "canonical", href: "/terms" }],
  }),
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-[#050607] text-[#f2eee7] py-16 px-4">
      <article className="mx-auto max-w-2xl">
        <Link to="/unlock" className="text-xs text-[#B6BCC8] hover:text-[#f2eee7]">← Back to access</Link>
        <h1 className="mt-4 font-serif text-3xl text-[#f4a125] tracking-wide">Terms of Service</h1>
        <p className="mt-1 text-xs text-[#B6BCC8]/70 uppercase tracking-widest">Aetheris Obsidian</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-[#B6BCC8]">
          <section>
            <h2 className="text-[#f2eee7] font-semibold mb-2">1. Overview</h2>
            <p>Aetheris Obsidian is an AI-assisted software builder. By using the service you agree to these terms. If you do not agree, do not use the service.</p>
          </section>
          <section>
            <h2 className="text-[#f2eee7] font-semibold mb-2">2. Accounts</h2>
            <p>You are responsible for your account credentials and the activity that occurs under your account. You must be legally able to enter into this agreement.</p>
          </section>
          <section>
            <h2 className="text-[#f2eee7] font-semibold mb-2">3. Subscriptions and billing</h2>
            {(() => {
              // Rendered from PLAN_TIERS so it cannot drift out of sync with
              // checkout (this used to list five tiers that no longer exist).
              const priced = PLAN_TIERS.filter((t) => t.priceId);
              const list = priced.map((t) => `${t.name} ${t.price}${t.cadence}`).join(", ");
              const custom = PLAN_TIERS.find((t) => t.cta === "contact");
              return (
                <p>
                  Paid Obsidian plans are billed monthly in USD through Stripe at the price shown on the plan you select ({list}
                  {custom ? `; ${custom.name} is ${custom.price.toLowerCase()}` : ""}). Legacy Obsidian Pro subscribers ($30/month) remain grandfathered on their original price. Each billing period includes an allowance of AI credits used for cloud AI and provider work. Unused credits do not roll over. You may cancel at any time. Under the current cancellation flow, cancellation takes effect immediately and paid access may end at that time; billing for future periods stops.
                </p>
              );
            })()}
          </section>
          <section>
            <h2 className="text-[#f2eee7] font-semibold mb-2">4. Local mode</h2>
            <p>Local editing, previews, deterministic tooling, exports, screenshots, and local history remain free and do not leave your browser.</p>
          </section>
          <section>
            <h2 className="text-[#f2eee7] font-semibold mb-2">5. Acceptable use</h2>
            <p>You may not use the service to generate content that is unlawful, infringes third-party rights, or attempts to circumvent rate limits, credit accounting, or entitlement checks.</p>
          </section>
          <section>
            <h2 className="text-[#f2eee7] font-semibold mb-2">6. Content</h2>
            <p>You retain ownership of code and content you create. You grant us a limited license to process it for the sole purpose of operating the service.</p>
          </section>
          <section>
            <h2 className="text-[#f2eee7] font-semibold mb-2">7. Disclaimer</h2>
            <p>The service is provided "as is" without warranties of any kind. AI-generated output may contain errors and should be reviewed before use.</p>
          </section>
          <section>
            <h2 className="text-[#f2eee7] font-semibold mb-2">8. Changes</h2>
            <p>We may update these terms. Material changes will be communicated on the access screen.</p>
          </section>
        </div>
      </article>
    </div>
  );
}
