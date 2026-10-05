import {
  resolveGateway, gatewayKey, gatewayChatUrl, gatewayModel,
  gatewayImagesUrl, gatewayTranscribeUrl, gatewayImageModel,
} from '../ai-gateway';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
};

const KEYS = ['AI_GATEWAY_URL', 'AI_GATEWAY_KEY', 'AI_GATEWAY_MODEL', 'LOVABLE_API_KEY', 'GOOGLE_AI_API_KEY', 'AI_IMAGE_URL', 'AI_IMAGE_MODEL'];
function withEnv(vars: Record<string, string>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, vars);
  try { fn(); } finally {
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

console.log('\nai-gateway: current Lovable deployment is byte-for-byte unchanged');
withEnv({ LOVABLE_API_KEY: 'lov-key', GOOGLE_AI_API_KEY: 'g-key' }, () => {
  check('Lovable wins when its key is set (even with a Google key present)', resolveGateway().kind === 'lovable');
  check('chat URL is the original Lovable URL', gatewayChatUrl() === 'https://ai.gateway.lovable.dev/v1/chat/completions');
  check('key is the Lovable key', gatewayKey() === 'lov-key');
  check('model ids pass through untouched', gatewayModel('google/gemini-3.1-flash-lite') === 'google/gemini-3.1-flash-lite');
  check('image URL is the original Lovable images URL', gatewayImagesUrl() === 'https://ai.gateway.lovable.dev/v1/images/generations');
  check('transcription URL is the original Lovable URL', gatewayTranscribeUrl() === 'https://ai.gateway.lovable.dev/v1/audio/transcriptions');
  check('image model default is unchanged', gatewayImageModel('google/gemini-3-pro-image') === 'google/gemini-3-pro-image');
});

console.log('\nai-gateway: Google AI Studio free tier (self-hosted, no Lovable)');
withEnv({ GOOGLE_AI_API_KEY: 'g-key' }, () => {
  check('resolves to google', resolveGateway().kind === 'google');
  check('uses Google OpenAI-compatible chat URL', gatewayChatUrl() === 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  check('uses the Google key', gatewayKey() === 'g-key');
  check('strips the google/ prefix for Google', !gatewayModel('google/gemini-3.1-flash-lite').startsWith('google/'));
  check('maps non-Google model ids to a Gemini model', gatewayModel('openai/gpt-5.4').startsWith('gemini'));
  check('no image endpoint on Google free tier (degrades gracefully)', gatewayImagesUrl() === null);
  check('no transcription endpoint on Google free tier', gatewayTranscribeUrl() === null);
});

console.log('\nai-gateway: custom OpenAI-compatible gateway (e.g. OpenRouter)');
withEnv({ AI_GATEWAY_URL: 'https://openrouter.ai/api/v1/', AI_GATEWAY_KEY: 'or-key', AI_GATEWAY_MODEL: 'vendor/free-model', LOVABLE_API_KEY: 'lov-key' }, () => {
  check('custom gateway takes priority when both URL and key are set', resolveGateway().kind === 'custom');
  check('trailing slash is normalized', gatewayChatUrl() === 'https://openrouter.ai/api/v1/chat/completions');
  check('AI_GATEWAY_MODEL forces one model for every call', gatewayModel('google/anything') === 'vendor/free-model');
});
withEnv({ AI_GATEWAY_URL: 'https://openrouter.ai/api/v1', LOVABLE_API_KEY: 'lov-key' }, () => {
  check('custom URL without a key does NOT hijack the Lovable setup', resolveGateway().kind === 'lovable');
});
withEnv({ AI_GATEWAY_URL: 'https://x.example/v1', AI_GATEWAY_KEY: 'k' }, () => {
  check('without AI_GATEWAY_MODEL, custom gateway passes model ids through', gatewayModel('meta/llama') === 'meta/llama');
});

console.log('\nai-gateway: explicit image endpoint override');
withEnv({ GOOGLE_AI_API_KEY: 'g-key', AI_IMAGE_URL: 'https://img.example/v1/images/generations', AI_IMAGE_MODEL: 'img-model' }, () => {
  check('AI_IMAGE_URL enables images even on Google', gatewayImagesUrl() === 'https://img.example/v1/images/generations');
  check('AI_IMAGE_MODEL overrides the image model', gatewayImageModel('google/gemini-3-pro-image') === 'img-model');
});

console.log('\nai-gateway: nothing configured');
withEnv({}, () => {
  check('resolves to none', resolveGateway().kind === 'none');
  check('no key, so callers report "AI not configured" instead of sending a bad request', gatewayKey() === undefined);
});

console.log(`\nai-gateway: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
