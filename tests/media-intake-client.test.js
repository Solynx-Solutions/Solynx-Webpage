const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../digital-media-tech/menu.js'), 'utf8');

async function fixture(status = 502, networkFailure = false, search) {
  class Element {
    constructor(attributes = {}) { this.attributes = attributes; this.events = {}; this.hidden = true; this.disabled = false; this.open = false; }
    addEventListener(name, callback) { this.events[name] = callback; }
    getAttribute(name) { return this.attributes[name] || null; }
    setAttribute(name, value) { this.attributes[name] = value; }
    querySelector() { return new Element(); }
    querySelectorAll() { return []; }
    appendChild() {}
    focus() {}
  }
  class Form extends Element { reportValidity() { return true; } }
  class Button extends Element {}
  const form = new Form();
  const submit = new Button();
  const reset = new Button();
  const option = new Button({ 'data-scope-id': 'website-loop', 'data-scope-label': 'Website hero loop', 'data-price-key': 'website-loop', 'data-selection-kind': 'service' });
  const nodes = new Map([['scopeLeadForm', form], ['scopeSubmit', submit], ['scopeReset', reset]]);
  const get = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  const values = new Map(Object.entries({
    fullName: 'Offline Fixture', email: 'fixture@example.test', business: 'Offline Example', phone: '831-555-0100',
    preferredContact: 'email', description: 'Offline contract check', location: 'Santa Cruz', timeline: 'Exploring', website: '',
    intendedUse: '  Website introduction  ', deliveryChannels: 'Website', footageReadiness: 'No supplied footage',
    usageRights: 'Review required', decisionProcess: 'Owner review', unknown: 'Do not forward'
  }));
  const posts = [];
  const document = {
    querySelector: selector => selector === 'form#scopeLeadForm' ? form : selector === 'button#scopeSubmit' ? submit : selector === 'button#scopeReset' ? reset : null,
    querySelectorAll: selector => selector.startsWith('.scopeOption') ? [option] : [],
    getElementById: get, createElement: () => new Element()
  };
  const window = { location: { search: search === undefined ? '?utm_source=offline&utm_medium=review&utm_campaign=media_20261105&utm_content=hero&utm_term=coast&email=private%40example.test&fbclid=private&token=private&market=unverified' : search }, setTimeout };
  class FixtureFormData { get(key) { return values.get(key) || null; } }
  vm.runInNewContext(source, {
    document, window, HTMLFormElement: Form, HTMLButtonElement: Button, FormData: FixtureFormData, URLSearchParams,
    fetch: async (_url, options = {}) => {
      if (options.method !== 'POST') return { ok: true, json: async () => ({ ready: true }) };
      posts.push(JSON.parse(options.body));
      if (networkFailure) throw Error('simulated connection loss');
      return { ok: false, status, json: async () => ({ error: 'Synthetic offline result' }) };
    }
  });
  await new Promise(resolve => setImmediate(resolve));
  option.events.click();
  await form.events.submit({ preventDefault() {} });
  return { form, submit, nodes, posts };
}

test('client carries selected scope and bounded qualification/campaign facts without private query or consent mutation', async () => {
  const f = await fixture();
  assert.equal(f.posts.length, 1);
  const payload = f.posts[0];
  assert.deepEqual(payload.selections, [{ id: 'website-loop', quantity: 1, kind: 'service' }]);
  assert.equal(payload.qualifiers.intendedUse, 'Website introduction');
  assert.equal(Object.keys(payload.qualifiers).length, 5);
  assert.deepEqual(payload.attribution, { utm_source: 'offline', utm_medium: 'review', utm_campaign: 'media_20261105', utm_content: 'hero', utm_term: 'coast' });
  assert.equal(payload.preferredContact, 'email');
  assert.equal(payload.marketingConsent, false);
  assert.doesNotMatch(JSON.stringify(payload), /private|fbclid|unverified|unknown|token|dnd/);
});

test('partial or ambiguous save is held and cannot submit again in the same page', async () => {
  for (const networkFailure of [false, true]) {
    const f = await fixture(502, networkFailure);
    assert.equal(f.submit.disabled, true);
    assert.match(f.nodes.get('scopeLeadStatus').textContent, /Please do not resubmit/);
    await f.form.events.submit({ preventDefault() {} });
    assert.equal(f.posts.length, 1);
  }
});

test('known pre-write validation rejection permits correction without revealing prices', async () => {
  const f = await fixture(400);
  assert.equal(f.submit.disabled, false);
  assert.equal(f.nodes.get('approvedPricebook').hidden, true);
});

test('invalid and empty campaign values are omitted rather than manufacturing attribution', async () => {
  const f = await fixture(400, false, '?utm_source=private%40example.test&utm_medium=&utm_campaign=' + 'x'.repeat(81) + '&utm_content=two+words&utm_term=valid-slug');
  assert.deepEqual(f.posts[0].attribution, { utm_term: 'valid-slug' });
});
