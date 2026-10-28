import assert from "node:assert/strict";
import {
  FULL_APP_INTEGRATIONS,
  integrationPublicVariableNames,
  integrationSecretNames,
  normalizeFullAppIntegrationNames,
} from "../full-app-integrations.ts";

const detected = normalizeFullAppIntegrationNames([
  "Stripe subscriptions",
  "Send transactional email with Resend",
  "HubSpot CRM sync",
  "OpenAI assistant",
]);
assert.deepEqual(new Set(detected), new Set(["stripe", "resend", "hubspot", "openai"]));

const secrets = integrationSecretNames(["stripe", "resend", "openai"]);
assert.ok(secrets.includes("STRIPE_SECRET_KEY"));
assert.ok(secrets.includes("STRIPE_WEBHOOK_SECRET"));
assert.ok(secrets.includes("RESEND_API_KEY"));
assert.ok(secrets.includes("OPENAI_API_KEY"));
assert.equal(secrets.filter(v => v === "OPENAI_API_KEY").length, 1);

const vars = integrationPublicVariableNames(["stripe"]);
assert.deepEqual(vars, ["VITE_STRIPE_PUBLISHABLE_KEY"]);

assert.deepEqual(FULL_APP_INTEGRATIONS.twilio.secrets, ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]);
assert.deepEqual(FULL_APP_INTEGRATIONS.hubspot.publicVars, []);

console.log("Full App integration registry tests passed");
