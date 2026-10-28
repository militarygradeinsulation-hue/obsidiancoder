import assert from "node:assert/strict";
import {
  acceptancePlanFile,
  acceptanceSpecFile,
  addAcceptanceFiles,
} from "../full-app-acceptance.ts";
import { parseFullAppBlueprint } from "../full-app-blueprint.ts";
import { isEditableAppPath, isGeneratedAcceptancePath } from "../full-app-edits.ts";

const blueprint = parseFullAppBlueprint({
  version: 1,
  name: "Acceptance Demo",
  summary: "Tests a public path and an authenticated CRUD path.",
  primaryUsers: ["member"],
  routes: [
    { path: "/", name: "Home", purpose: "Landing", authRequired: false, primaryActions: ["view"] },
    { path: "/customers", name: "Customers", purpose: "Manage customers", authRequired: true, primaryActions: ["create customer"] },
  ],
  entities: [{
    name: "customers",
    purpose: "Customer records",
    ownership: "user",
    fields: [{ name: "name", type: "text", required: true, notes: "" }],
  }],
  sharedComponents: [],
  auth: { required: true, methods: ["email_password"], roles: [], notes: "" },
  storage: { required: false, privateByDefault: true, uses: [] },
  serverFunctions: [],
  integrations: [],
  implementationOrder: ["Build customer flow"],
  acceptanceChecks: ["Home renders", "Member can sign in", "Member can create customer"],
  acceptanceJourneys: [
    {
      name: "Public home",
      purpose: "Verify public content",
      authRequired: false,
      steps: [
        { action: "goto", path: "/", note: "" },
        { action: "expect_visible", testId: "home-title", note: "" },
      ],
    },
    {
      name: "Create customer",
      purpose: "Verify authenticated CRUD",
      authRequired: true,
      steps: [
        { action: "goto", path: "/login", note: "" },
        { action: "fill", testId: "login-email", value: "", valueFrom: "e2e_email", note: "" },
        { action: "fill", testId: "login-password", value: "", valueFrom: "e2e_password", note: "" },
        { action: "click", testId: "login-submit", note: "" },
        { action: "fill", testId: "customer-name", value: "QA Customer", valueFrom: "literal", note: "" },
        { action: "click", testId: "save-customer", note: "" },
        { action: "expect_text", testId: "customer-list", text: "QA Customer", note: "" },
      ],
    },
  ],
});

const spec = acceptanceSpecFile(blueprint);
assert.ok(spec.includes('test("Public home"'));
assert.ok(spec.includes('test("Create customer"'));
assert.ok(spec.includes('process.env.OBSIDIAN_E2E_EMAIL'));
assert.ok(spec.includes('process.env.OBSIDIAN_E2E_PASSWORD'));
assert.ok(spec.includes('OBSIDIAN_REQUIRE_AUTH_E2E'));
assert.ok(spec.includes('getByTestId("customer-name").fill("QA Customer")'));
assert.ok(spec.includes('getByTestId("customer-list")'));
assert.ok(spec.includes('Authenticated acceptance journey requires'));

const plan = JSON.parse(acceptancePlanFile(blueprint));
assert.equal(plan.app, "Acceptance Demo");
assert.equal(plan.journeys.length, 2);

const files = addAcceptanceFiles({ "src/App.tsx": "export default function App(){return null}" }, blueprint);
assert.ok(files["tests/obsidian.acceptance.spec.ts"]);
assert.ok(files["obsidian/acceptance.json"]);

assert.equal(isGeneratedAcceptancePath("tests/obsidian.acceptance.spec.ts"), true);
assert.equal(isGeneratedAcceptancePath("obsidian/acceptance.json"), true);
assert.equal(isEditableAppPath("tests/obsidian.acceptance.spec.ts"), false);
assert.equal(isEditableAppPath("obsidian/acceptance.json"), false);

console.log("Full App executable acceptance journey tests passed");
