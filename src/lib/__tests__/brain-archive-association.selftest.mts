import assert from "node:assert/strict";
import { archiveEntryForLearning } from "../proven-templates.ts";

const archive = [
  { id:"newer-weak", at:200, surface:"pocket", title:"Weak", prompt:"", model:"m", html:"<main>weak</main>", bytes:20, family:"editorial", profile:"fast" },
  { id:"approved-exact", at:100, surface:"pocket", title:"Approved", prompt:"", model:"m", html:"<main><section>approved</section></main>", bytes:40, family:"editorial", profile:"studio" },
] as any;

const learning = {
  id:"l1", at:100, surface:"pocket", profile:"studio", family:"editorial",
  dnaId:"dna", dnaSeed:1, dnaAxes:{layout:"",typography:"",palette:"",depth:"",signature:""},
  model:"m", critique:{composition:9}, designIssues:[], validationStatus:"passed",
  latencyMs:1000, outcome:"kept",
} as any;

assert.equal(archiveEntryForLearning(archive,{...learning,archiveId:"approved-exact"},"pocket")?.id,"approved-exact");
assert.equal(archiveEntryForLearning(archive,{...learning,archiveId:"missing"},"pocket"),null);
assert.equal(archiveEntryForLearning(archive,learning,"pocket")?.id,"newer-weak");
assert.equal(archiveEntryForLearning(archive,{...learning,archiveId:"approved-exact"},"vibe"),null);
console.log("Brain exact archive association tests passed");
