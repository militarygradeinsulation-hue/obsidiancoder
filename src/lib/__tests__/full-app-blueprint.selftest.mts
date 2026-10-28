import assert from "node:assert/strict";
import {
  blueprintImplementationPrompt,
  parseFullAppBlueprint,
} from "../full-app-blueprint.ts";

const blueprint = parseFullAppBlueprint({
  version: 1,
  name: "Contractor CRM",
  summary: "A signed-in CRM for contractors to manage customers and work.",
  primaryUsers: ["contractor owner"],
  routes: [
    { path: "/dashboard", name: "Dashboard", purpose: "Overview", authRequired: true, primaryActions: ["review pipeline"] },
    { path: "/customers", name: "Customers", purpose: "Manage customers", authRequired: true, primaryActions: ["add customer"] },
  ],
  entities: [
    {
      name: "customers",
      purpose: "Customer records",
      ownership: "user",
      fields: [
        { name: "name", type: "text", required: true, notes: "" },
        { name: "email", type: "text", required: false, notes: "" },
      ],
    },
  ],
  sharedComponents: [
    { name: "AppShell", purpose: "Shared navigation and layout", sharedAcross: ["/dashboard", "/customers"] },
  ],
  auth: { required: true, methods: ["email_password"], roles: [], notes: "" },
  storage: { required: false, privateByDefault: true, uses: [] },
  serverFunctions: [],
  integrations: [
    { name: "Stripe", purpose: "Take subscription payments", secretRequired: true },
    { name: "Resend", purpose: "Send transactional email", secretRequired: true },
  ],
  implementationOrder: ["Create authenticated shell", "Add customer CRUD"],
  acceptanceChecks: [
    "Signed-out users see authentication.",
    "Signed-in users can create a customer.",
    "Users cannot read another user's customers.",
  ],
});

assert.equal(blueprint.version, 1);
assert.equal(blueprint.routes.length, 2);
assert.equal(blueprint.entities[0]?.ownership, "user");

const prompt = blueprintImplementationPrompt(blueprint);
assert.ok(prompt.includes("APPLICATION BLUEPRINT"));
assert.ok(prompt.includes("Contractor CRM"));
assert.ok(prompt.includes("auth.uid()"));
assert.ok(prompt.includes("Never place secret keys in frontend files"));
assert.ok(prompt.includes("highest-value coherent slice"));
assert.ok(prompt.includes("STRIPE_SECRET_KEY"));
assert.ok(prompt.includes("STRIPE_WEBHOOK_SECRET"));
assert.ok(prompt.includes("RESEND_API_KEY"));
assert.ok(prompt.includes("server-only path"));

assert.throws(() => parseFullAppBlueprint({
  ...blueprint,
  entities: [{
    name: "bad",
    purpose: "invalid ownership",
    ownership: "everyone",
    fields: [{ name: "name", type: "text", required: true, notes: "" }],
  }],
}));

assert.throws(() => parseFullAppBlueprint({
  ...blueprint,
  auth: { required: true, methods: ["password_in_url"], roles: [], notes: "" },
}));

console.log("Full App blueprint schema and implementation prompt tests passed");
