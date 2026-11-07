export function normalizeDomain(raw: string): string {
  const input = raw.trim().toLowerCase().replace(/\.$/, "");
  if (/[\/:@?#\s]/.test(input)) throw new Error("Enter a hostname only, such as example.com or www.example.com.");
  const host = new URL("https://" + input).hostname;
  if (host.length > 253 || !host.includes(".") || /(?:^|\.)localhost$|\.local$|\.github\.io$/.test(host) ||
      /^[\d.]+$/.test(host) || !host.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))
    throw new Error("Enter a valid domain you own.");
  return host;
}
export const PAGES_IPV4 = ["185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"];
export function domainRecords(domain: string, login: string, proof: string) {
  return [
    { type: "TXT", name: "_obsidian-verification." + domain, value: proof },
    // Both options are shown because domain depth cannot identify an apex (e.g. example.co.uk).
    { type: "CNAME", name: domain, value: login.toLowerCase() + ".github.io", note: "For a subdomain, use this CNAME. At the root domain, use the A records instead." },
    ...PAGES_IPV4.map(value => ({ type: "A", name: domain, value, note: "Root domain alternative to CNAME; use all four A records." })),
  ];
}
export async function dnsAnswers(name: string, type: "TXT" | "CNAME" | "A"): Promise<string[]> {
  const response = await fetch("https://dns.google/resolve?name=" + encodeURIComponent(name) + "&type=" + type,
    { signal: AbortSignal.timeout(8000), headers: { accept: "application/dns-json" } });
  if (!response.ok) throw new Error("DNS lookup is unavailable. Retry shortly.");
  const result = await response.json() as { Status: number; Answer?: Array<{ type: number; data: string }> };
  if (result.Status !== 0 && result.Status !== 3) throw new Error("DNS lookup failed. Retry shortly.");
  const code = { TXT: 16, CNAME: 5, A: 1 }[type];
  return (result.Answer ?? []).filter(a => a.type === code).map(a => a.data.replace(/"\s*"/g, "").replace(/^"|"$/g, "").replace(/\.$/, "").toLowerCase());
}
