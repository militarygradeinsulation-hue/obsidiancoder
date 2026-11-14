import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const component = readFileSync(resolve("src/components/LovablePartnerSpotlight.tsx"), "utf8");
const css = readFileSync(resolve("src/components/LovablePartnerSpotlight.css"), "utf8");
const page = readFileSync(resolve("src/routes/index.tsx"), "utf8");

assert.ok(component.includes("https://lovable.dev/?partner_ref=499V5382"), "wrong referral URL");
assert.ok(component.includes("Get 10 free credits + partner perks"), "free-credit CTA missing");
assert.ok(component.includes("Hire Aetheris Technology"), "Aetheris hiring message missing");
assert.ok(component.includes('rel: "sponsored noopener noreferrer"'), "partner links must be marked sponsored");
assert.ok(component.includes("/partner/lovable-referral-qr.svg"), "QR asset missing");
assert.ok(page.includes('import { LovablePartnerSpotlight } from "@/components/LovablePartnerSpotlight";'), "missing partner banner import");
assert.ok(page.includes("<LovablePartnerSpotlight compact />"), "partner banner is not at the top of Obsidian Vibe");
assert.ok(css.includes(".lv-partner-2026--compact"), "compact workspace-safe layout missing");

console.log("PASS: Lovable partner banner, referral link, free-credit CTA and top placement verified.");
