import {
  isAnthropicModel,
  anthropicWireModel,
  toAnthropicRequest,
  translateAnthropicSSE,
} from '../anthropic';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
};

console.log('\nanthropic: model ids');
check('recognizes anthropic/ prefix', isAnthropicModel('anthropic/claude-sonnet-5'));
check('rejects non-anthropic id', !isAnthropicModel('google/gemini-3.5-flash'));
check('haiku maps to dated wire id', anthropicWireModel('anthropic/claude-haiku-4-5') === 'claude-haiku-4-5-20251001');
check('sonnet passes through unchanged', anthropicWireModel('anthropic/claude-sonnet-5') === 'claude-sonnet-5');

console.log('\nanthropic: request shape');
const req = toAnthropicRequest(
  [
    { role: 'system', content: 'You are an elite engineer.' },
    { role: 'system', content: 'Second system block.' },
    { role: 'user', content: 'Build a landing page.' },
  ],
  'claude-sonnet-5',
);
check('system messages pulled into top-level system field', req.system === 'You are an elite engineer.\n\nSecond system block.');
check('system never appears in messages array', !req.messages.some((m) => (m as { role: string }).role === 'system'));
check('max_tokens is present (Anthropic requires it)', typeof req.max_tokens === 'number' && req.max_tokens > 0);
check('stream is true', req.stream === true);
check('single user turn preserved', req.messages.length === 1 && req.messages[0].role === 'user');

const consecutive = toAnthropicRequest(
  [
    { role: 'user', content: 'first' },
    { role: 'user', content: 'second' },
    { role: 'assistant', content: 'reply' },
  ],
  'claude-sonnet-5',
);
check('consecutive same-role turns merged', consecutive.messages.length === 2);
check('merged content joins both turns', consecutive.messages[0].content.includes('first') && consecutive.messages[0].content.includes('second'));

const noLeadingUser = toAnthropicRequest([{ role: 'assistant', content: 'stray' }], 'claude-sonnet-5');
check('array is coerced to start with a user turn', noLeadingUser.messages[0].role === 'user');

console.log('\nanthropic: SSE translation');

// Real fixture shape, taken from Anthropic's documented streaming format.
const fixture = [
  'event: message_start',
  'data: {"type":"message_start","message":{"id":"msg_1","usage":{"input_tokens":1200}}}',
  '',
  'event: content_block_start',
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
  '',
  'event: ping',
  'data: {"type":"ping"}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"<!doctype "}}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"html>"}}',
  '',
  'event: content_block_stop',
  'data: {"type":"content_block_stop","index":0}',
  '',
  'event: message_delta',
  'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":340}}',
  '',
  'event: message_stop',
  'data: {"type":"message_stop"}',
  '',
].join('\n');

// Real Anthropic streams don't guarantee a trailing blank line after the
// final event — the connection just closes. anthropicResponseToOpenAIStream
// appends "\n\n" on the final read() to flush whatever's buffered; this test
// does the same so it exercises the actual call pattern instead of a
// friendlier one.
const t = translateAnthropicSSE(fixture + '\n\n');
const textDeltas = t.lines
  .filter((l) => l.startsWith('data: {') && l.includes('"content"'))
  .map((l) => JSON.parse(l.slice(6)).choices[0].delta.content as string);

check('extracts both text deltas in order', textDeltas.join('') === '<!doctype html>');
check('ping and content_block_start produce no output lines', t.lines.filter((l) => l.includes('ping')).length === 0);
check('emits a final usage frame', t.lines.some((l) => l.includes('"prompt_tokens":1200') && l.includes('"completion_tokens":340')));
check('emits [DONE] after message_stop', t.lines.includes('data: [DONE]'));
check('marks done=true', t.done === true);
check('captures input tokens from message_start', t.usage.inputTokens === 1200);
check('captures output tokens from message_delta', t.usage.outputTokens === 340);

// Partial block at the end of a chunk (the real streaming case) must not be
// parsed early and must come back as remainder for the next read().
const partial = 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"partial"}}\n\nevent: content_block_delta\ndata: {"type":"content_block_de';
const p = translateAnthropicSSE(partial);
check('complete block before the cut is emitted', p.lines.some((l) => l.includes('partial')));
check('incomplete trailing block is held as remainder, not dropped', p.remainder.length > 0 && !p.done);

// Regression: WITHOUT the flush, the final block must NOT be silently
// dropped — it has to come back as remainder so the caller can retry it
// once more input (or the flush) arrives. This is the exact bug this test
// file caught on first run: message_stop with no trailing blank line was
// being held as an incomplete remainder, which is correct — it's the
// caller's job to flush at true stream end, not this function's.
const unflushed = translateAnthropicSSE(fixture);
check('without a flush, the final unterminated block is held, not dropped', unflushed.remainder.length > 0);
check('without a flush, done is correctly still false', unflushed.done === false);

const empty = translateAnthropicSSE('');
check('empty buffer produces no lines and no crash', empty.lines.length === 0 && !empty.done);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
