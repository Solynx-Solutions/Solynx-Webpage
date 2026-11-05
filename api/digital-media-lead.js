/* SOLYNX Digital Media intake. Remains closed until its own scoped credentials,
 * workflow, owner, origin, and activation flag are supplied and verified. */
const CRM_BASE = 'https://services.leadconnectorhq.com';
const { createHash } = require('node:crypto');
// Inquiry catalog contains only service labels accepted by this bounded intake.
const CATALOG = {
  'video-half': 'Two-camera half day',
  'video-full': 'Two-camera full day',
  photography: 'Photography session',
  drone: 'Aerial capture session',
  'editing-half': 'Half-day editing block',
  'editing-full': 'Full-day editing block',
  'editing-10': '10 prepaid editing hours',
  'editing-20': '20 prepaid editing hours',
  'editing-40': '40 prepaid editing hours',
  consulting: 'Creative consulting session',
  'regional-assessment': 'Footage assessment',
  'regional-social': 'Social repurpose set',
  'customer-story': 'Customer story project',
  'monthly-content': 'Monthly content session',
  'launch-reel': 'Launch Reel package',
  'story-session': 'Story Session package',
  'signature-production': 'Signature Production package',
  'website-loop': 'Website hero loop',
  'promo-edit': 'Promo / testimonial editing'
};
const VALID_ITEMS = new Set(Object.keys(CATALOG));
const PACKAGE_ITEMS = new Set(['launch-reel', 'story-session', 'signature-production', 'customer-story', 'monthly-content']);

// Rafael approved these exact one-time standalone customer prices on 2026-11-05.
// Keep price data server-side and return it only after the full intake transaction
// below is confirmed; the readiness endpoint intentionally reveals no rates.
const APPROVED_STANDALONE_PRICES = Object.freeze({
  alpha: Object.freeze({ label: 'Alpha package', amount: 7000, display: '$7,000' }),
  lite: Object.freeze({ label: 'Lite package', amount: 4000, display: '$4,000' }),
  starter: Object.freeze({ label: 'Starter package', amount: 2750, display: '$2,750' }),
  'website-loop': Object.freeze({ label: 'Website hero loop', amount: 750, display: '$750' }),
  'promo-edit': Object.freeze({ label: 'Promo / testimonial editing', amount: 1200, display: '$1,200' }),
  drone: Object.freeze({ label: 'Drone aerial production', amount: 1000, display: '$1,000' }),
  photography: Object.freeze({ label: 'Photography', amount: 1000, display: '$1,000' })
});

function configured() {
  return process.env.SOLYNX_MEDIA_INTAKE_ENABLED === 'true' &&
    Boolean(process.env.SOLYNX_MEDIA_CRM_TOKEN &&
      process.env.SOLYNX_MEDIA_LOCATION_ID &&
      process.env.SOLYNX_MEDIA_TASK_OWNER_ID &&
      process.env.SOLYNX_MEDIA_WORKFLOW_ID &&
      process.env.SOLYNX_MEDIA_ALLOWED_ORIGINS &&
      process.env.SOLYNX_MEDIA_GUARD_REST_TOKEN &&
      guardUrl());
}

function guardUrl() {
  try {
    const url = new URL(process.env.SOLYNX_MEDIA_GUARD_REST_URL || '');
    // The guard credential is never sent to an arbitrary configured host.
    return url.protocol === 'https:' && /^[a-z0-9-]+\.upstash\.io$/i.test(url.hostname) &&
      url.pathname === '/' && !url.search && !url.hash ? url.origin : '';
  } catch { return ''; }
}

function reply(res, status, data) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(data);
}

function clean(value, max) {
  // Control characters are intentionally removed from incoming form strings.
  // eslint-disable-next-line no-control-regex
  return typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : '';
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

async function crm(path, body, method = 'POST') {
  const response = await fetch(CRM_BASE + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + process.env.SOLYNX_MEDIA_CRM_TOKEN,
      Version: 'v3',
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('CRM request failed: ' + response.status);
  return response.json();
}

// Atomic hourly limits: five attempts per normalized email and sixty overall.
// The overall budget also bounds randomized-address abuse; no client-supplied IP
// is trusted. Redis stores only a digest of the email, not the address itself.
const RATE_SCRIPT = `
local a = tonumber(redis.call('GET', KEYS[1]) or '0')
local b = tonumber(redis.call('GET', KEYS[2]) or '0')
if a >= 5 or b >= 60 then return 0 end
for i = 1, 2 do
  local n = redis.call('INCR', KEYS[i])
  if n == 1 then redis.call('EXPIRE', KEYS[i], 3600) end
end
return 1`;

async function allowIntake(email) {
  const digest = createHash('sha256').update(email).digest('hex');
  const response = await fetch(guardUrl(), {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.SOLYNX_MEDIA_GUARD_REST_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(['EVAL', RATE_SCRIPT, 2,
      'solynx:media:rate:email:' + digest, 'solynx:media:rate:global']),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Intake throttle unavailable');
  const result = await response.json();
  if (!result || result.error || ![0, 1].includes(result.result)) {
    throw new Error('Intake throttle did not confirm admission');
  }
  return result.result === 1;
}

async function reserveIntake(marker) {
  // One durable, atomic SET NX across every serverless instance. No expiry:
  // an uncertain partial write remains reserved until a human reconciles it.
  const response = await fetch(guardUrl(), {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.SOLYNX_MEDIA_GUARD_REST_TOKEN,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(['SET', 'solynx:media:intake:' + marker, 'reserved', 'NX']),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Intake guard request failed: ' + response.status);
  const result = await response.json();
  if (result && result.error) throw new Error('Intake guard rejected reservation');
  if (result && result.result === 'OK') return true;
  if (result && result.result === null) return false;
  throw new Error('Intake guard did not confirm reservation');
}

module.exports = async function digitalMediaLead(req, res) {
  if (req.method === 'GET') return reply(res, 200, { ready: configured() });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return reply(res, 405, { error: 'Method not allowed' });
  }
  if (!configured()) return reply(res, 503, { error: 'Intake is not connected yet.' });

  const allowedOrigins = process.env.SOLYNX_MEDIA_ALLOWED_ORIGINS.split(',').map((item) => item.trim());
  if (!allowedOrigins.includes(req.headers.origin)) return reply(res, 403, { error: 'Origin not allowed' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (JSON.stringify(body).length > 8000) return reply(res, 413, { error: 'Brief is too large.' });
  if (body.website) return reply(res, 400, { error: 'Brief could not be accepted.' });

  const fullName = clean(body.fullName, 120);
  const email = clean(body.email, 254).toLowerCase();
  const business = clean(body.business, 160);
  const phone = clean(body.phone, 40);
  const preferredContact = clean(body.preferredContact, 16);
  const description = clean(body.description, 1200);
  const location = clean(body.location, 160);
  const timeline = clean(body.timeline, 160);
  const mode = body.mode === 'inquiry' ? 'inquiry' : '';
  const items = Array.isArray(body.items) ? body.items : [];
  const selections = Array.isArray(body.selections) ? body.selections : [];
  const marketingConsent = body.marketingConsent === true;
  const packageChoice = typeof body.packageChoice === 'string' ? body.packageChoice : null;
  const selectionsValid = selections.length === items.length && selections.every((selection, index) =>
    selection && selection.id === items[index] && selection.quantity === 1 &&
    selection.kind === (PACKAGE_ITEMS.has(selection.id) ? 'package' : 'service'));
  const expectedPackage = items.find((item) => PACKAGE_ITEMS.has(item)) || null;
  if (!fullName || !validEmail(email) || !business || !phone ||
      !['email', 'phone', 'text'].includes(preferredContact) || !description || !mode ||
      !items.length || items.length > VALID_ITEMS.size ||
      items.some((item) => typeof item !== 'string' || !VALID_ITEMS.has(item)) ||
      new Set(items).size !== items.length ||
      !selectionsValid || packageChoice !== expectedPackage ||
      (items.some((item) => ['launch-reel', 'story-session', 'signature-production', 'customer-story', 'monthly-content'].includes(item)) && items.length > 1) ||
      [['video-half', 'video-full'], ['editing-half', 'editing-full'],
        ['editing-10', 'editing-20', 'editing-40']].some((group) =>
        group.filter((item) => items.includes(item)).length > 1)) {
    return reply(res, 400, { error: 'Complete the required fields and choose a valid scope.' });
  }

  // The matching CRM note is a secondary audit marker; the durable reservation
  // below is the concurrency guard, including for parallel serverless requests.
  const intakeKey = createHash('sha256').update(JSON.stringify({
    email, business, phone, preferredContact, description, location, timeline, mode,
    selections: selections.map(({ id, quantity, kind }) => ({ id, quantity, kind })).sort((a, b) => a.id.localeCompare(b.id)),
    packageChoice, marketingConsent
  })).digest('hex');
  const marker = 'SOLYNX-DM-INTAKE:' + intakeKey;

  const brief = [
    'SOLYNX Digital Media & Tech inquiry',
    'Intake marker: ' + marker,
    'Pricing: approved standalone rates may be shown after this confirmed save; final scope still requires written review.',
    'Selected services: ' + selections.map((selection) => CATALOG[selection.id] + ' [' + selection.id + '] x' + selection.quantity).join('; '),
    'Package choice: ' + (packageChoice ? CATALOG[packageChoice] + ' [' + packageChoice + ']' : 'None'),
    'Business: ' + business,
    'Project: ' + description,
    'Location: ' + (location || 'Not provided'),
    'Timeline: ' + (timeline || 'Not provided'),
    'Phone: ' + (phone || 'Not provided'),
    'Preferred project contact: ' + ({ email: 'Email', phone: 'Phone call', text: 'Text message' }[preferredContact]),
    'Contact preference only; not SMS or marketing consent and no message was triggered.',
    'Optional marketing updates requested: ' + (marketingConsent ? 'Yes; record only, no DND change or automatic enrollment.' : 'No; checkbox remained unchecked.'),
    'Planning selections only; no price or production commitment. Rights and final scope require review.'
  ].join('\n');

  try {
    if (!await allowIntake(email)) {
      res.setHeader('Retry-After', '3600');
      return reply(res, 429, { error: 'Too many inquiry attempts. Please try again later or contact digitalmedia@solynx.solutions.' });
    }
    if (!await reserveIntake(marker)) {
      return reply(res, 409, { error: 'This brief may already be in review. Please contact digitalmedia@solynx.solutions before resubmitting.' });
    }
    const saved = await crm('/contacts/upsert', {
      locationId: process.env.SOLYNX_MEDIA_LOCATION_ID,
      name: fullName,
      email
    });
    const contact = saved && saved.contact;
    if (!contact || !contact.id || contact.locationId !== process.env.SOLYNX_MEDIA_LOCATION_ID ||
        clean(contact.email, 254).toLowerCase() !== email) {
      throw new Error('CRM did not confirm the expected contact save');
    }
    const contactPath = '/contacts/' + encodeURIComponent(contact.id);
    const existing = await crm(contactPath + '/notes', undefined, 'GET');
    if (!existing || !Array.isArray(existing.notes)) throw new Error('CRM did not confirm the note ledger');
    if (existing.notes.some((entry) => typeof entry.body === 'string' && entry.body.includes(marker))) {
      return reply(res, 409, { error: 'This brief may already be in review. Please contact digitalmedia@solynx.solutions before resubmitting.' });
    }
    const note = await crm(contactPath + '/notes', { title: 'Digital Media project brief', body: brief });
    if (!note || !note.note || !note.note.id) throw new Error('CRM did not confirm the brief note');
    const task = await crm(contactPath + '/tasks', {
      title: 'Review Digital Media inquiry',
      body: 'Intake marker: ' + marker + '\nReview scope, rights, timing, and quote. Coordinate with Sean and Amber. Do not promise a booking before approval.',
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      completed: false,
      assignedTo: process.env.SOLYNX_MEDIA_TASK_OWNER_ID
    });
    if (!task || !task.task || !task.task.id) throw new Error('CRM did not confirm the follow-up task');
    const enrollment = await crm(contactPath + '/workflow/' + encodeURIComponent(process.env.SOLYNX_MEDIA_WORKFLOW_ID), {});
    if (!enrollment || enrollment.succeeded !== true) throw new Error('CRM did not confirm workflow enrollment');
    const matchingPrices = Object.fromEntries(items
      .filter((item) => Object.hasOwn(APPROVED_STANDALONE_PRICES, item))
      .map((item) => [item, APPROVED_STANDALONE_PRICES[item]]));
    return reply(res, 201, { saved: true, prices: matchingPrices });
  } catch (error) {
    console.error('Digital Media intake incomplete:', error.message);
    return reply(res, 502, { error: 'We could not confirm every intake step. Part of your brief may have been saved. Please do not resubmit; contact digitalmedia@solynx.solutions for a status check.' });
  }
};
