/* SOLYNX Digital Media intake. Remains closed until its own scoped credentials,
 * workflow, owner, origin, and activation flag are supplied and verified. */
const CRM_BASE = 'https://services.leadconnectorhq.com';
const VALID_ITEMS = new Set([
  'video-half', 'video-full', 'photography', 'drone', 'editing-half',
  'editing-full', 'editing-10', 'editing-20', 'editing-40', 'consulting',
  'regional-assessment', 'regional-social', 'customer-story',
  'monthly-content', 'alpha'
]);

function configured() {
  return process.env.SOLYNX_MEDIA_INTAKE_ENABLED === 'true' &&
    Boolean(process.env.SOLYNX_MEDIA_CRM_TOKEN &&
      process.env.SOLYNX_MEDIA_LOCATION_ID &&
      process.env.SOLYNX_MEDIA_TASK_OWNER_ID &&
      process.env.SOLYNX_MEDIA_WORKFLOW_ID &&
      process.env.SOLYNX_MEDIA_ALLOWED_ORIGINS);
}

function reply(res, status, data) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(data);
}

function clean(value, max) {
  return typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : '';
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

async function crm(path, body) {
  const response = await fetch(CRM_BASE + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.SOLYNX_MEDIA_CRM_TOKEN,
      Version: 'v3',
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('CRM request failed: ' + response.status);
  return response.json();
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
  const description = clean(body.description, 1200);
  const location = clean(body.location, 160);
  const timeline = clean(body.timeline, 160);
  const mode = body.mode === 'regional' ? 'Regional proposal' : body.mode === 'current' ? 'Current menu' : '';
  const items = Array.isArray(body.items) ? body.items : [];
  if (!fullName || !validEmail(email) || !business || !description || !mode ||
      !items.length || items.length > VALID_ITEMS.size ||
      items.some((item) => typeof item !== 'string' || !VALID_ITEMS.has(item)) ||
      new Set(items).size !== items.length) {
    return reply(res, 400, { error: 'Complete the required fields and choose a valid scope.' });
  }

  const brief = [
    'SOLYNX Digital Media & Tech inquiry',
    'Rate set: ' + mode,
    'Selected menu IDs: ' + items.join(', '),
    'Business: ' + business,
    'Project: ' + description,
    'Location: ' + (location || 'Not provided'),
    'Timeline: ' + (timeline || 'Not provided'),
    'Phone: ' + (phone || 'Not provided'),
    'Planning selections only; no price or production commitment. Rights and final scope require review.'
  ].join('\n');

  try {
    const saved = await crm('/contacts/upsert', {
      locationId: process.env.SOLYNX_MEDIA_LOCATION_ID,
      name: fullName,
      email,
      ...(phone ? { phone } : {}),
      companyName: business,
      source: 'SOLYNX Digital Media website inquiry'
    });
    const contact = saved && saved.contact;
    if (!contact || !contact.id || contact.locationId !== process.env.SOLYNX_MEDIA_LOCATION_ID) {
      throw new Error('CRM did not confirm the expected contact save');
    }
    const contactPath = '/contacts/' + encodeURIComponent(contact.id);
    const note = await crm(contactPath + '/notes', { title: 'Digital Media project brief', body: brief });
    if (!note || !note.note || !note.note.id) throw new Error('CRM did not confirm the brief note');
    const task = await crm(contactPath + '/tasks', {
      title: 'Review Digital Media inquiry',
      body: 'Review scope, rights, timing, and quote. Coordinate with Sean and Amber. Do not promise a booking before approval.',
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      completed: false,
      assignedTo: process.env.SOLYNX_MEDIA_TASK_OWNER_ID
    });
    if (!task || !task.task || !task.task.id) throw new Error('CRM did not confirm the follow-up task');
    const enrollment = await crm(contactPath + '/workflow/' + encodeURIComponent(process.env.SOLYNX_MEDIA_WORKFLOW_ID), {});
    if (!enrollment || enrollment.succeeded !== true) throw new Error('CRM did not confirm workflow enrollment');
    return reply(res, 201, { saved: true });
  } catch (error) {
    console.error('Digital Media intake incomplete:', error.message);
    return reply(res, 502, { error: 'We could not confirm every intake step. Please contact digitalmedia@solynx.solutions.' });
  }
};
