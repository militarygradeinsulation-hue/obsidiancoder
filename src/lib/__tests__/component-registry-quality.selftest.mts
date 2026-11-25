import assert from "node:assert/strict";
import { matchComponentsIn } from "../component-registry.ts";

const now = Date.now();
const registry = [
  { id:"legacy",label:"Pricing card",kind:"pricing-card",markup:"<article>legacy</article>",keywords:["pricing"],usageCount:9,createdAt:now,lastUsedAt:now },
  { id:"approved",label:"Pricing card",kind:"pricing-card",markup:"<article>approved</article>",keywords:["pricing"],usageCount:1,qualityApproved:true,createdAt:now,lastUsedAt:now },
] as any;

const match = matchComponentsIn(registry,"build a pricing page",3);
assert.equal(match.some((c) => c.id === "legacy"),false);
assert.equal(match.some((c) => c.id === "approved"),true);
assert.equal(matchComponentsIn(registry,"weather radar",3).length,0);
console.log("Brain component quality-gate tests passed");
