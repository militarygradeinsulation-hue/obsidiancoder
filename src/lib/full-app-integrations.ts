export const FULL_APP_INTEGRATIONS = {
  stripe: {
    id: "stripe",
    label: "Stripe",
    aliases: ["stripe", "payments", "checkout"],
    secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    publicVars: ["VITE_STRIPE_PUBLISHABLE_KEY"],
    purpose: "Payments, subscriptions, checkout, billing webhooks",
  },
  resend: {
    id: "resend",
    label: "Resend",
    aliases: ["resend", "email", "transactional email"],
    secrets: ["RESEND_API_KEY"],
    publicVars: [],
    purpose: "Transactional email",
  },
  twilio: {
    id: "twilio",
    label: "Twilio",
    aliases: ["twilio", "sms", "text messaging", "voice"],
    secrets: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    publicVars: [],
    purpose: "SMS, voice, phone workflows",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    aliases: ["openai", "gpt", "chatgpt", "ai"],
    secrets: ["OPENAI_API_KEY"],
    publicVars: [],
    purpose: "Server-side AI features",
  },
  google: {
    id: "google",
    label: "Google",
    aliases: ["google", "google maps", "google oauth", "gmail", "calendar"],
    secrets: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    publicVars: [],
    purpose: "Google OAuth and Google APIs",
  },
  hubspot: {
    id: "hubspot",
    label: "HubSpot",
    aliases: ["hubspot", "crm"],
    secrets: ["HUBSPOT_ACCESS_TOKEN"],
    publicVars: [],
    purpose: "CRM synchronization",
  },
} as const;

export type FullAppIntegrationId = keyof typeof FULL_APP_INTEGRATIONS;

export const FULL_APP_INTEGRATION_IDS = Object.keys(FULL_APP_INTEGRATIONS) as FullAppIntegrationId[];

export function normalizeFullAppIntegrationNames(names: string[]): FullAppIntegrationId[] {
  const found = new Set<FullAppIntegrationId>();
  for (const raw of names) {
    const name = raw.trim().toLowerCase();
    if (!name) continue;
    for (const id of FULL_APP_INTEGRATION_IDS) {
      const def = FULL_APP_INTEGRATIONS[id];
      if (id === name || def.aliases.some(alias => name.includes(alias))) found.add(id);
    }
  }
  return [...found];
}

export function integrationSecretNames(ids: FullAppIntegrationId[]): string[] {
  return [...new Set(ids.flatMap(id => [...FULL_APP_INTEGRATIONS[id].secrets]))];
}

export function integrationPublicVariableNames(ids: FullAppIntegrationId[]): string[] {
  return [...new Set(ids.flatMap(id => [...FULL_APP_INTEGRATIONS[id].publicVars]))];
}
