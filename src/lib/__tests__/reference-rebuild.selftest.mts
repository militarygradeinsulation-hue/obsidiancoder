import {
  buildReferencePrompt,
  isSensitiveReferenceText,
  normalizeReferenceUrl,
  type VisualScan,
} from "../reference-rebuild.functions";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}`);
  }
}

console.log("\nreference-rebuild: deterministic safety + prompt behavior");

const publicUrl = normalizeReferenceUrl("example.com/path#section");
check("public URL is normalized to https", publicUrl.ok && publicUrl.url.startsWith("https://example.com/path"));
check("hash fragments are removed", publicUrl.ok && !publicUrl.url.includes("#section"));

const local = normalizeReferenceUrl("http://127.0.0.1:3000/admin");
check("localhost/private IPv4 is blocked", !local.ok && local.code === "private_url");

const lan = normalizeReferenceUrl("http://192.168.1.10");
check("private LAN address is blocked", !lan.ok && lan.code === "private_url");

check("login form language is sensitive", isSensitiveReferenceText("Welcome back. Sign in with your password."));
check("payment capture language is sensitive", isSensitiveReferenceText("Checkout — enter credit card number and CVV."));
check("ordinary commerce copy is not automatically sensitive", !isSensitiveReferenceText("Browse products, view pricing, and purchase from our catalog."));

const scan: VisualScan = {
  pageType: "landing",
  summary: "Editorial product landing page with a split hero and warm neutral palette.",
  layout: ["Asymmetric 60/40 split hero", "Wide editorial sections"],
  colors: ["#101014", "#DB861F", "#F5EFE7"],
  typography: "Condensed display headline with neutral sans-serif body",
  spacing: "Large vertical rhythm with 80px desktop section spacing",
  borders: "Hairline neutral borders",
  radii: "12px cards",
  shadows: "Soft low-opacity shadows",
  sections: [{ name: "Hero", structure: "copy left, image right", contentRole: "intro", visualNotes: "large headline" }],
  components: ["compact nav", "feature cards"],
  interactions: ["subtle hover lift"],
  responsive: ["stack hero at mobile"],
  visibleContent: ["Brand headline", "Primary CTA"],
  assets: ["hero-product.jpg"],
  confidence: 93,
};

const exact = buildReferencePrompt(scan, "https://example.com", true);
check("exact mode includes authorization marker", exact.includes("AUTHORIZED EXACT REBUILD MODE"));
check("exact mode carries visible content", exact.includes("VISIBLE CONTENT TO REPRODUCE"));
check("exact mode carries assets", exact.includes("ASSETS / IMAGE REFERENCES"));

const inspired = buildReferencePrompt(scan, "https://example.com", false);
check("inspired mode includes rights-safe marker", inspired.includes("STYLE/LAYOUT REFERENCE MODE"));
check("inspired mode omits visible-content reproduction block", !inspired.includes("VISIBLE CONTENT TO REPRODUCE"));
check("inspired mode omits source-asset reproduction block", !inspired.includes("ASSETS / IMAGE REFERENCES"));
check("all modes prohibit credential capture", inspired.includes("Never create credential capture"));

console.log(`\nreference-rebuild: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
