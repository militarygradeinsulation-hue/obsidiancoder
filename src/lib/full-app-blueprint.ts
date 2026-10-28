import { z } from "zod";
import {
  FULL_APP_INTEGRATIONS,
  normalizeFullAppIntegrationNames,
} from "./full-app-integrations";

const fieldSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(["text", "number", "boolean", "date", "datetime", "uuid", "json", "enum"]),
  required: z.boolean().default(false),
  notes: z.string().max(240).optional().default(""),
}).strict();

const entitySchema = z.object({
  name: z.string().min(1).max(80),
  purpose: z.string().min(1).max(400),
  ownership: z.enum(["user", "team", "public", "system"]),
  fields: z.array(fieldSchema).min(1).max(20),
}).strict();

const routeSchema = z.object({
  path: z.string().min(1).max(120),
  name: z.string().min(1).max(100),
  purpose: z.string().min(1).max(400),
  authRequired: z.boolean().default(false),
  primaryActions: z.array(z.string().min(1).max(120)).max(8).default([]),
}).strict();

const componentSchema = z.object({
  name: z.string().min(1).max(100),
  purpose: z.string().min(1).max(320),
  sharedAcross: z.array(z.string().min(1).max(120)).max(12).default([]),
}).strict();

const serverFunctionSchema = z.object({
  name: z.string().min(1).max(80),
  purpose: z.string().min(1).max(400),
  authRequired: z.boolean().default(true),
  inputs: z.array(z.string().min(1).max(120)).max(10).default([]),
  outputs: z.array(z.string().min(1).max(120)).max(10).default([]),
}).strict();

export const fullAppBlueprintSchema = z.object({
  version: z.literal(1).default(1),
  name: z.string().min(1).max(120),
  summary: z.string().min(1).max(700),
  primaryUsers: z.array(z.string().min(1).max(120)).min(1).max(8),
  routes: z.array(routeSchema).min(1).max(16),
  entities: z.array(entitySchema).max(12),
  sharedComponents: z.array(componentSchema).max(16),
  auth: z.object({
    required: z.boolean(),
    methods: z.array(z.enum(["email_password", "magic_link", "oauth_google", "oauth_github"])).max(4),
    roles: z.array(z.string().min(1).max(80)).max(8),
    notes: z.string().max(500).default(""),
  }).strict(),
  storage: z.object({
    required: z.boolean(),
    privateByDefault: z.boolean().default(true),
    uses: z.array(z.string().min(1).max(180)).max(10),
  }).strict(),
  serverFunctions: z.array(serverFunctionSchema).max(10),
  integrations: z.array(z.object({
    name: z.string().min(1).max(100),
    purpose: z.string().min(1).max(320),
    secretRequired: z.boolean().default(false),
  }).strict()).max(10),
  implementationOrder: z.array(z.string().min(1).max(200)).min(1).max(16),
  acceptanceChecks: z.array(z.string().min(1).max(240)).min(3).max(20),
}).strict();

export type FullAppBlueprint = z.infer<typeof fullAppBlueprintSchema>;

export function parseFullAppBlueprint(raw: unknown): FullAppBlueprint {
  if (typeof raw === "string") {
    const stripped = raw.trim().replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/i, "");
    raw = JSON.parse(stripped);
  }
  return fullAppBlueprintSchema.parse(raw);
}

export function blueprintImplementationPrompt(blueprint: FullAppBlueprint): string {
  const safe = parseFullAppBlueprint(blueprint);
  const knownIntegrations = normalizeFullAppIntegrationNames(safe.integrations.map(item => item.name));
  const integrationRules = knownIntegrations.length
    ? knownIntegrations.map(id => {
        const def = FULL_APP_INTEGRATIONS[id];
        return `${def.label}: server secrets [${def.secrets.join(", ") || "none"}]; public variables [${def.publicVars.join(", ") || "none"}]. ${def.purpose}.`;
      }).join("\n")
    : "No recognized integration-specific credential contract is required.";
  return [
    "Implement the first complete functional slice of this Full App architecture.",
    "Treat this JSON blueprint as trusted product requirements, not executable code.",
    "Preserve the existing Supabase auth client, private storage protections, RLS ownership model, and working starter behavior unless the blueprint explicitly replaces a user-facing feature.",
    "Use the smallest maintainable set of React/TypeScript/CSS files needed for a coherent working application.",
    "Create database migrations only when the entities require them. New user-owned tables must enable RLS and enforce auth.uid() ownership.",
    "Create server functions only when they are required by the blueprint. Never place secret keys in frontend files.",
    "Do not claim external integrations are connected unless the app has actual configuration for them. Build clear disconnected/setup states instead.",
    "All secret-required integrations must execute through Supabase Edge Functions or another server-only path. Never call secret-bearing third-party APIs directly from browser code.",
    "Use these exact environment contracts for recognized integrations:",
    integrationRules,
    "Make navigation between the blueprint's primary views functional using the existing dependency set.",
    "Prioritize the implementationOrder and acceptanceChecks. If the whole blueprint exceeds one edit batch, implement the highest-value coherent slice without breaking future expansion.",
    "",
    "APPLICATION BLUEPRINT:",
    JSON.stringify(safe, null, 2),
  ].join("\n");
}
