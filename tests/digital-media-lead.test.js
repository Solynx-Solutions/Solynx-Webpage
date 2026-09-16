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
    payloads.push(options.body ? JSON.parse(options.body) : null);
    const bodies = [
      { contact: { id: 'test-contact', locationId: 'test-location' } },
      { notes: [] },
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
    '/contacts/test-contact/notes',
    '/contacts/test-contact/tasks',
    '/contacts/test-contact/workflow/test-workflow'
  ]);
  assert.match(payloads[2].body, /Selected services: Two-camera half day \[video-half\]/);
  assert.match(payloads[2].body, /Planning one-time starting subtotal: \$1,600/);
  assert.match(payloads[2].body, /Planning recurring monthly: \$0\/mo/);
  assert.match(payloads[2].body, /Intake marker: SOLYNX-DM-INTAKE:[a-f0-9]{64}/);
});

test('accepts current-menu consulting as unpriced planning scope', async () => {
  configure();
  const payloads = [];
  global.fetch = async (_url, options) => {
    payloads.push(options.body ? JSON.parse(options.body) : null);
    const bodies = [
      { contact: { id: 'test-contact', locationId: 'test-location' } },
      { notes: [] },
      { note: { id: 'test-note' } },
      { task: { id: 'test-task' } },
      { succeeded: true }
    ];
    return { ok: true, json: async () => bodies[payloads.length - 1] };
  };
  const result = response();
  await handler(request('POST', { ...sample, items: ['consulting'] }), result);
  assert.equal(result.statusCode, 201);
  assert.match(payloads[2].body, /plus unpriced scope/);
});

test('does not report full success when downstream workflow is unconfirmed', async () => {
  configure();
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    const bodies = [
      { contact: { id: 'test-contact', locationId: 'test-location' } },
      { notes: [] },
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

test('each missing configuration value keeps submissions closed without network writes', async () => {
  for (const key of ['SOLYNX_MEDIA_CRM_TOKEN', 'SOLYNX_MEDIA_LOCATION_ID',
    'SOLYNX_MEDIA_TASK_OWNER_ID', 'SOLYNX_MEDIA_WORKFLOW_ID', 'SOLYNX_MEDIA_ALLOWED_ORIGINS']) {
    configure();
    delete process.env[key];
    global.fetch = async () => { assert.fail('Unconfigured intake must not write'); };
    const result = response();
    await handler(request('POST'), result);
    assert.equal(result.statusCode, 503, key);
  }
});

test('partial saves stop downstream writes and never unlock download', async () => {
  const valid = [
    { contact: { id: 'test-contact', locationId: 'test-location' } },
    { notes: [] },
    { note: { id: 'test-note' } },
    { task: { id: 'test-task' } },
    { succeeded: true }
  ];
  const failures = [
    { contact: { id: 'wrong-contact', locationId: 'different-location' } },
    {}, {}, {}, { succeeded: false }
  ];
  const oldError = console.error;
  console.error = () => {};
  try {
    for (let stage = 0; stage < failures.length; stage += 1) {
      configure();
      let calls = 0;
      global.fetch = async () => {
        const index = calls++;
        return { ok: true, json: async () => index === stage ? failures[stage] : valid[index] };
      };
      const result = response();
      await handler(request('POST'), result);
      assert.equal(result.statusCode, 502, 'failure stage ' + stage);
      assert.equal(result.body.saved, undefined);
      assert.equal(calls, stage + 1, 'must stop at the first unconfirmed step');
    }
  } finally { console.error = oldError; }
});

test('retry after a saved brief stops before duplicate task or workflow writes', async () => {
  configure();
  let savedBrief = '';
  let call = 0;
  const oldError = console.error;
  console.error = () => {};
  try {
    global.fetch = async (_url, options) => {
      call += 1;
      const payload = options.body ? JSON.parse(options.body) : null;
      const result = [
        { contact: { id: 'test-contact', locationId: 'test-location' } },
        { notes: [] },
        { note: { id: 'test-note' } },
        {}
      ][call - 1];
      if (call === 3) savedBrief = payload.body;
      return { ok: true, json: async () => result };
    };
    const first = response();
    await handler(request('POST'), first);
    assert.equal(first.statusCode, 502);
    assert.equal(call, 4);
    assert.match(savedBrief, /SOLYNX-DM-INTAKE:[a-f0-9]{64}/);

    const retryPaths = [];
    global.fetch = async (url) => {
      retryPaths.push(new URL(url).pathname);
      const result = retryPaths.length === 1
        ? { contact: { id: 'test-contact', locationId: 'test-location' } }
        : { notes: [{ id: 'test-note', body: savedBrief }] };
      return { ok: true, json: async () => result };
    };
    const retry = response();
    await handler(request('POST'), retry);
    assert.equal(retry.statusCode, 409);
    assert.equal(retry.body.saved, undefined);
    assert.deepEqual(retryPaths, ['/contacts/upsert', '/contacts/test-contact/notes']);
  } finally { console.error = oldError; }
});
