import { extractImageSlots, applyImageUrls, isSafeImageUrl, finishImagePrompt, FILLED_ATTR } from '../image-slots';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
};

const GOOD = 'https://abcxyz.supabase.co/storage/v1/object/public/build-images/live/2026-10-01/req-0.png';
const GOOD2 = 'https://abcxyz.supabase.co/storage/v1/object/public/build-images/live/2026-10-01/req-1.png';

const page = `<!doctype html><html><body>
<img data-obs-image="Sunlit modern bakery counter with fresh sourdough, warm morning light" src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" width="1200" height="800" alt="Bakery counter">
<img src="logo.svg" alt="logo">
<img alt="Team" data-obs-image='Three bakers laughing in a flour-dusted kitchen' width="600" height="400">
<img data-obs-image="x" src="a.svg" alt="too short">
<img data-obs-image="Close-up of a croissant cross-section, golden layers" src="b.svg" alt="c">
<img data-obs-image="Fourth image that should be cut by the limit" src="d.svg" alt="d">
</body></html>`;

console.log('\nimage-slots: extraction');
const slots = extractImageSlots(page);
check('finds marked slots only, ignores plain <img>', slots.every((s) => s.tag.includes('data-obs-image')));
check('respects the default limit of 3', slots.length === 3);
check('skips prompts that are too short to be meaningful', !slots.some((s) => s.prompt === 'x'));
check('keeps document order (hero first)', slots[0].prompt.startsWith('Sunlit modern bakery'));
check('reads single-quoted attribute values', slots[1].prompt.startsWith('Three bakers'));
check('limit=1 returns only the first (hero) slot', extractImageSlots(page, 1).length === 1);
check('non-string / empty input never throws', extractImageSlots('').length === 0 && extractImageSlots(undefined as unknown as string).length === 0);
check('decodes HTML entities in the prompt', extractImageSlots('<img data-obs-image="Tom &amp; Jerry&#39;s cafe interior">')[0]?.prompt === "Tom & Jerry's cafe interior");

console.log('\nimage-slots: URL safety gate');
check('accepts our own build-images storage URL', isSafeImageUrl(GOOD));
check('rejects http (not https)', !isSafeImageUrl(GOOD.replace('https', 'http')));
check('rejects a different bucket', !isSafeImageUrl(GOOD.replace('build-images', 'private-stuff')));
check('rejects arbitrary external hosts that are not storage paths', !isSafeImageUrl('https://evil.example.com/x.png'));
check('rejects quote/angle-bracket injection attempts', !isSafeImageUrl(GOOD + '"><script>alert(1)</script>'));
check('rejects javascript: URLs', !isSafeImageUrl('javascript:alert(1)'));

console.log('\nimage-slots: applying URLs');
const out = applyImageUrls(page, [{ tag: slots[0].tag, url: GOOD }, { tag: slots[1].tag, url: GOOD2 }]);
check('replaces an existing src with the real URL', out.includes(`src="${GOOD}"`));
check('adds src when the slot had none', out.includes(`src="${GOOD2}"`));
check('marks filled slots so they are never regenerated', (out.match(new RegExp(FILLED_ATTR, 'g')) ?? []).length === 2);
check('leaves unfilled slots untouched', out.includes('Close-up of a croissant') && !out.includes(`${GOOD}" alt="c"`));
check('a refill pass skips already-filled slots', extractImageSlots(out).every((s) => !s.tag.includes(FILLED_ATTR)) && extractImageSlots(out).length === 2);
const unsafe = applyImageUrls(page, [{ tag: slots[0].tag, url: 'https://evil.example.com/x.png' }]);
check('an unsafe URL is ignored, HTML left exactly as it was', unsafe === page);
check('plain <img> tags are never modified', out.includes('<img src="logo.svg" alt="logo">'));

console.log('\nimage-slots: prompt finishing');
const fp = finishImagePrompt('A quiet library at dusk');
check('keeps the slot prompt', fp.startsWith('A quiet library at dusk'));
check('forbids text and watermarks in generated images', /no text/i.test(fp) && /no watermark/i.test(fp));

console.log(`\nimage-slots: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
