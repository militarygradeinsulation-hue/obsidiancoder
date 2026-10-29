// Connections Hub catalog — pure data, safe for browser and tests.
// Only providers with `implemented: true` have a real server flow.

export type ProviderId = "github" | "google" | "supabase" | "stripe" | "microsoft" | "hubspot";

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  blurb: string;
  implemented: boolean;
  /** Server env vars the provider needs before Connect is offered. */
  requiredEnv: string[];
  scopes: string[];
  prerequisites: string;
}

export const GITHUB_SCOPES = ["read:user"];

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "github",
    name: "GitHub",
    blurb: "Link your GitHub account to your Obsidian profile.",
    implemented: true,
    requiredEnv: ["GITHUB_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_SECRET", "CONNECTIONS_TOKEN_KEY"],
    scopes: GITHUB_SCOPES,
    prerequisites: "A GitHub OAuth App whose callback URL is the Obsidian connections callback.",
  },
  {
    id: "google",
    name: "Google",
    blurb: "Drive, Calendar and Gmail data.",
    implemented: false,
    requiredEnv: [],
    scopes: [],
    prerequisites: "Needs a Google Cloud OAuth client and verified consent screen. Not built yet.",
  },
  {
    id: "supabase",
    name: "Supabase",
    blurb: "Your own database projects.",
    implemented: false,
    requiredEnv: [],
    scopes: [],
    prerequisites: "Needs a Supabase OAuth integration app. Not built yet.",
  },
  {
    id: "stripe",
    name: "Stripe",
    blurb: "Your Stripe account for payments.",
    implemented: false,
    requiredEnv: [],
    scopes: [],
    prerequisites: "Needs Stripe Connect platform setup. Not built yet.",
  },
  {
    id: "microsoft",
    name: "Microsoft",
    blurb: "Outlook, OneDrive and Teams.",
    implemented: false,
    requiredEnv: [],
    scopes: [],
    prerequisites: "Needs a Microsoft Entra app registration. Not built yet.",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    blurb: "CRM contacts and deals.",
    implemented: false,
    requiredEnv: [],
    scopes: [],
    prerequisites: "Needs a HubSpot public app. Not built yet.",
  },
];

export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const OAUTH_START_LIMIT = 10; // per user per TTL window
export const CALLBACK_PATH = "/api/public/connections/github/callback";
export const DEFAULT_PUBLIC_ORIGIN = "https://obsidianvibe.live";

/** Map a callback outcome code to UI text. Unknown codes never echo raw input. */
export const CALLBACK_MESSAGES: Record<string, string> = {
  connected: "GitHub connected.",
  denied: "GitHub authorization was cancelled.",
  invalid_state: "That connection link expired or was already used. Please try again.",
  missing_binding:
    "That GitHub link wasn't started in this browser (or a newer attempt replaced it). Start again from this page.",
  exchange_failed: "GitHub didn't accept the authorization. Please try again.",
  identity_failed: "Couldn't read your GitHub profile. Please try again.",
  not_configured: "GitHub connections aren't set up yet.",
  error: "Something went wrong connecting GitHub.",
};
export function callbackMessage(code: string | undefined | null): string | null {
  if (!code) return null;
  return CALLBACK_MESSAGES[code] ?? CALLBACK_MESSAGES.error;
}
