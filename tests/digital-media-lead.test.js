const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/digital-media-lead');

const sample = {
  fullName: 'Example Person',
  email: 'example@example.test',
  business: 'Example Business',
  description: 'A short film inquiry.',
  location: 'Santa Cruz',
  timeline: 'Next month',
  mode: 'current',
  items: ['video-half']
};

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }
  };
}

function request(method, body = sample, origin = 'https://www.solynx.solutions') {
  return { method, body, headers: { origin } };
}

function configure() {
  process.env.SOLYNX_MEDIA_INTAKE_ENABLED = 'true';
  process.env.SOLYNX_MEDIA_CRM_TOKEN = 'test-token';
  process.env.SOLYNX_MEDIA_LOCATION_ID = 'test-location';
  process.env.SOLYNX_MEDIA_TASK_OWNER_ID = 'test-owner';
  process.env.SOLYNX_MEDIA_WORKFLOW_ID = 'test-workflow';
  process.env.SOLYNX_MEDIA_ALLOWED_ORIGINS = 'https://www.solynx.solutions';
}

test('intake remains closed without an activation gate', async () => {
  delete process.env.SOLYNX_MEDIA_INTAKE_ENABLED;
  const status = response();
  await handler(request('GET'), status);
  assert.deepEqual(status.body, { ready: false });
  const submission = response();
  await handler(request('POST'), submission);
  assert.equal(submission.statusCode, 503);
});

test('rejects wrong origin and invalid selection before CRM writes', async () => {
  configure();
  let calls = 0;
  global.fetch = async () => { calls += 1; throw new Error('must not call CRM'); };
  const wrongOrigin = response();
  await handler(request('POST', sample, 'https://other.example'), wrongOrigin);
  assert.equal(wrongOrigin.statusCode, 403);
  const invalid = response();
  await handler(request('POST', { ...sample, items: ['unknown'] }), invalid);
  assert.equal(invalid.statusCode, 400);
  const wrongRateSet = response();
  await handler(request('POST', { ...sample, items: ['regional-social'] }), wrongRateSet);
  assert.equal(wrongRateSet.statusCode, 400);
  const mixedPackage = response();
  await handler(request('POST', { ...sample, items: ['alpha', 'video-half'] }), mixedPackage);
  assert.equal(mixedPackage.statusCode, 400);
  assert.equal(calls, 0);
});

test('confirms contact, brief, task, and workflow before unlocking the brief', async () => {
  configure();
  const paths = [];
  const payloads = [];
  global.fetch = async (url, options) => {
    paths.push(new URL(url).pathname);
    payloads.push(JSON.parse(options.body));
    const bodies = [
      { contact: { id: 'test-contact', locationId: 'test-location' } },
      { note: { id: 'test-note' } },
      { task: { id: 'test-task' } },
      { succeeded: true }
    ];
    return { ok: true, json: async () => bodies[paths.length - 1] };
  };
  const result = response();
  await handler(request('POST'), result);
  assert.equal(result.statusCode, 201);
  assert.deepEqual(result.body, { saved: true });
  assert.deepEqual(paths, [
    '/contacts/upsert',
    '/contacts/test-contact/notes',
    '/contacts/test-contact/tasks',
    '/contacts/test-contact/workflow/test-workflow'
  ]);
  assert.match(payloads[1].body, /Selected services: Two-camera half day \[video-half\]/);
  assert.match(payloads[1].body, /Planning one-time starting subtotal: \$1,600/);
  assert.match(payloads[1].body, /Planning recurring monthly: \$0\/mo/);
});

test('accepts current-menu consulting as unpriced planning scope', async () => {
  configure();
  const payloads = [];
  global.fetch = async (_url, options) => {
    payloads.push(JSON.parse(options.body));
    const bodies = [
      { contact: { id: 'test-contact', locationId: 'test-location' } },
      { note: { id: 'test-note' } },
      { task: { id: 'test-task' } },
      { succeeded: true }
    ];
    return { ok: true, json: async () => bodies[payloads.length - 1] };
  };
  const result = response();
  await handler(request('POST', { ...sample, items: ['consulting'] }), result);
  assert.equal(result.statusCode, 201);
  assert.match(payloads[1].body, /plus unpriced scope/);
});

test('does not report full success when downstream workflow is unconfirmed', async () => {
  configure();
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    const bodies = [
      { contact: { id: 'test-contact', locationId: 'test-location' } },
      { note: { id: 'test-note' } },
      { task: { id: 'test-task' } },
      { succeeded: false }
    ];
    return { ok: true, json: async () => bodies[calls - 1] };
  };
  const result = response();
  const oldError = console.error;
  console.error = () => {};
  try { await handler(request('POST'), result); } finally { console.error = oldError; }
  assert.equal(result.statusCode, 502);
  assert.equal(result.body.saved, undefined);
});
