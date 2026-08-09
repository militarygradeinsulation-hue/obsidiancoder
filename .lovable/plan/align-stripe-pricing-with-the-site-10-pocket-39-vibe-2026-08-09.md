# Align Stripe pricing with the site ($10 Pocket / $39 Vibe)

## Current state (verified)

- Stripe go-live is fully complete: sandbox and live accounts are connected, the Lovable app is installed on the live account, live keys are provisioned, and the readiness check passed. Live checkout is ready.
- Checkout, billing portal, cancel, and the webhook handler are all wired and resolve prices by lookup key (`obsidian_pocket_monthly`, `obsidian_creator_monthly`), so no plumbing work is needed.
- The only gap is the amount: the Vibe plan is displayed at $39/month on the site, while a code comment records the Stripe price for `obsidian_creator_monthly` as $79 — never verified or corrected.

## What will be done

1. Set the recurring monthly amounts on the existing price IDs so Stripe matches the site:
   - `obsidian_pocket_monthly` — $10.00/month USD, single quantity
   - `obsidian_creator_monthly` — $39.00/month USD, single quantity
   Both reuse their existing IDs so lookup keys transfer and checkout code stays unchanged.
2. Verify each price after the change by reading it back through Stripe and confirming the amount, interval, and lookup key.
3. Move existing subscribers to the new amounts: update each live subscription's item to the new price at the next renewal (no immediate proration charge), so nobody is billed a mid-cycle difference.
4. Remove the stale "$79" warning comment in the plan catalog and replace it with the confirmed amount.
5. Run a sandbox checkout smoke test for both plans to confirm the amount shown at checkout is $10 and $39.

## Notes

- Prices created in the test environment sync to live on the next publish, so the site must be published after this change for live checkout to charge the new amounts.
- Existing subscribers keep their current rate until their next renewal date, then move to the new price automatically.
