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
  mode: 'inquiry',
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
  process.env.SOLYNX_MEDIA_GUARD_REST_URL = 'https://test-guard.upstash.io/';
  process.env.SOLYNX_MEDIA_GUARD_REST_TOKEN = 'test-guard-token';
}

function guarded(crmFetch, guard = async () => ({ result: 'OK' })) {
  return async (url, options) => {
    if (new URL(url).hostname === 'test-guard.upstash.io') {
      if (JSON.parse(options.body)[0] === 'EVAL') return { ok: true, json: async () => ({ result: 1 }) };
      assert.deepEqual(JSON.parse(options.body).slice(-1), ['NX']);
      return { ok: true, json: guard };
    }
    return crmFetch(url, options);
  };
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
  await handler(request('POST', { ...sample, mode: 'current' }), wrongRateSet);
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
  global.fetch = guarded(async (url, options) => {
    paths.push(new URL(url).pathname);
    payloads.push(options.body ? JSON.parse(options.body) : null);
    const bodies = [
      { contact: { id: 'test-contact', locationId: 'test-location', email: sample.email } },
      { notes: [] },
      { note: { id: 'test-note' } },
      { task: { id: 'test-task' } },
      { succeeded: true }
    ];
    return { ok: true, json: async () => bodies[paths.length - 1] };
  });
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
  assert.deepEqual(payloads[0], {
    locationId: 'test-location', name: sample.fullName, email: sample.email
  });
  assert.match(payloads[2].body, /Selected services: Two-camera half day \[video-half\]/);
  assert.match(payloads[2].body, /personalized quote requested/);
  assert.doesNotMatch(payloads[2].body, /\$|subtotal|Rate set/);
  assert.match(payloads[2].body, /Intake marker: SOLYNX-DM-INTAKE:[a-f0-9]{64}/);
});

test('accepts consulting as a pricing inquiry', async () => {
  configure();
  const payloads = [];
  global.fetch = guarded(async (_url, options) => {
    payloads.push(options.body ? JSON.parse(options.body) : null);
    const bodies = [
      { contact: { id: 'test-contact', locationId: 'test-location', email: sample.email } },
      { notes: [] },
      { note: { id: 'test-note' } },
      { task: { id: 'test-task' } },
      { succeeded: true }
    ];
    return { ok: true, json: async () => bodies[payloads.length - 1] };
  });
  const result = response();
  await handler(request('POST', { ...sample, items: ['consulting'] }), result);
  assert.equal(result.statusCode, 201);
  assert.match(payloads[2].body, /personalized quote requested/);
});

test('does not report full success when downstream workflow is unconfirmed', async () => {
  configure();
  let calls = 0;
  global.fetch = guarded(async () => {
    calls += 1;
    const bodies = [
      { contact: { id: 'test-contact', locationId: 'test-location', email: sample.email } },
      { notes: [] },
      { note: { id: 'test-note' } },
      { task: { id: 'test-task' } },
      { succeeded: false }
    ];
    return { ok: true, json: async () => bodies[calls - 1] };
  });
  const result = response();
  const oldError = console.error;
  console.error = () => {};
  try { await handler(request('POST'), result); } finally { console.error = oldError; }
  assert.equal(result.statusCode, 502);
  assert.equal(result.body.saved, undefined);
});

test('each missing configuration value keeps submissions closed without network writes', async () => {
  for (const key of ['SOLYNX_MEDIA_CRM_TOKEN', 'SOLYNX_MEDIA_LOCATION_ID',
    'SOLYNX_MEDIA_TASK_OWNER_ID', 'SOLYNX_MEDIA_WORKFLOW_ID', 'SOLYNX_MEDIA_ALLOWED_ORIGINS',
    'SOLYNX_MEDIA_GUARD_REST_URL', 'SOLYNX_MEDIA_GUARD_REST_TOKEN']) {
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
    { contact: { id: 'test-contact', locationId: 'test-location', email: sample.email } },
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
      global.fetch = guarded(async () => {
        const index = calls++;
        return { ok: true, json: async () => index === stage ? failures[stage] : valid[index] };
      });
      const result = response();
      await handler(request('POST'), result);
      assert.equal(result.statusCode, 502, 'failure stage ' + stage);
      assert.equal(result.body.saved, undefined);
      assert.equal(calls, stage + 1, 'must stop at the first unconfirmed step');
    }
  } finally { console.error = oldError; }
});

test('durable retry reservation stops before any duplicate CRM write', async () => {
  configure();
  let savedBrief = '';
  let call = 0;
  const oldError = console.error;
  console.error = () => {};
  try {
    global.fetch = guarded(async (_url, options) => {
      call += 1;
      const payload = options.body ? JSON.parse(options.body) : null;
      const result = [
        { contact: { id: 'test-contact', locationId: 'test-location', email: sample.email } },
        { notes: [] },
        { note: { id: 'test-note' } },
        {}
      ][call - 1];
      if (call === 3) savedBrief = payload.body;
      return { ok: true, json: async () => result };
    });
    const first = response();
    await handler(request('POST'), first);
    assert.equal(first.statusCode, 502);
    assert.equal(call, 4);
    assert.match(savedBrief, /SOLYNX-DM-INTAKE:[a-f0-9]{64}/);

    let retryWrites = 0;
    global.fetch = guarded(async () => { retryWrites += 1; assert.fail('Retry must not reach CRM'); },
      async () => ({ result: null }));
    const retry = response();
    await handler(request('POST'), retry);
    assert.equal(retry.statusCode, 409);
    assert.equal(retry.body.saved, undefined);
    assert.equal(retryWrites, 0);
  } finally { console.error = oldError; }
});

test('stops before a note when upsert resolves to another email', async () => {
  configure();
  let calls = 0;
  global.fetch = guarded(async () => {
    calls += 1;
    return { ok: true, json: async () => ({
      contact: { id: 'other-contact', locationId: 'test-location', email: 'other@example.test' }
    }) };
  });
  const result = response();
  const oldError = console.error;
  console.error = () => {};
  try { await handler(request('POST'), result); } finally { console.error = oldError; }
  assert.equal(result.statusCode, 502);
  assert.equal(calls, 1);
});

test('parallel identical submissions admit one CRM write path', async () => {
  configure();
  let reserved = false;
  let crmWrites = 0;
  global.fetch = guarded(async (_url, options) => {
    crmWrites += 1;
    const results = [
      { contact: { id: 'test-contact', locationId: 'test-location', email: sample.email } },
      { notes: [] }, { note: { id: 'test-note' } }, { task: { id: 'test-task' } },
      { succeeded: true }
    ];
    assert.ok(options);
    return { ok: true, json: async () => results[crmWrites - 1] };
  }, async () => {
    if (reserved) return { result: null };
    reserved = true;
    return { result: 'OK' };
  });
  const one = response();
  const two = response();
  await Promise.all([handler(request('POST'), one), handler(request('POST'), two)]);
  assert.deepEqual([one.statusCode, two.statusCode].sort(), [201, 409]);
  assert.equal(crmWrites, 5);
});

test('unavailable or malformed atomic guard stops before CRM', async () => {
  const oldError = console.error;
  console.error = () => {};
  try {
    for (const result of [
      { ok: false, json: async () => ({ error: 'unavailable' }), status: 503 },
      { ok: true, json: async () => ({ result: 'unexpected' }) }
    ]) {
      configure();
      let crmWrites = 0;
      global.fetch = async (url) => {
        if (new URL(url).hostname === 'test-guard.upstash.io') return result;
        crmWrites += 1;
        assert.fail('Guard failure must stop CRM writes');
      };
      const res = response();
      await handler(request('POST'), res);
      assert.equal(res.statusCode, 502);
      assert.equal(crmWrites, 0);
    }
  } finally { console.error = oldError; }
});

test('guard URL is restricted to approved HTTPS Redis REST host shape', async () => {
  configure();
  process.env.SOLYNX_MEDIA_GUARD_REST_URL = 'https://example.test/';
  const res = response();
  await handler(request('GET'), res);
  assert.deepEqual(res.body, { ready: false });
});


test('throttle rejection stops reservation and all CRM writes', async () => {
  configure();
  let calls = 0;
  global.fetch = async (url, options) => {
    calls += 1;
    assert.equal(new URL(url).hostname, 'test-guard.upstash.io');
    const command = JSON.parse(options.body);
    assert.equal(command[0], 'EVAL');
    assert.equal(command[2], 2);
    assert.match(command[3], /^solynx:media:rate:email:[a-f0-9]{64}$/);
    assert.equal(options.body.includes(sample.email), false);
    return { ok: true, json: async () => ({ result: 0 }) };
  };
  const res = response();
  await handler(request('POST'), res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['Retry-After'], '3600');
  assert.equal(calls, 1);
  assert.equal(res.body.saved, undefined);
});
