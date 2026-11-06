/* global require, __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'solynx-tracking-consent.js'), 'utf8');

function fixture(initialChoice = null) {
  const values = new Map(initialChoice ? [['solynx_analytics_consent', initialChoice]] : []);
  const nodes = new Map();
  const inserted = [];
  const firstScript = { parentNode: { insertBefore(node) { inserted.push(node); nodes.set(node.id, node); } } };
  const body = { appendChild(node) {
    nodes.set(node.id, node);
    if (node.id === 'solynx-consent-controls') {
      nodes.set('solynx-consent-panel', { hidden: false });
      nodes.set('solynx-consent-status', { textContent: '' });
      for (const id of ['solynx-consent-allow', 'solynx-consent-deny', 'solynx-consent-manage']) {
        nodes.set(id, { addEventListener() {} });
      }
    }
  } };
  const document = {
    readyState: 'complete', body,
    createElement(tag) {
      if (tag === 'script') return {};
      return { id: '', innerHTML: '' };
    },
    getElementById(id) { return nodes.get(id) || null; },
    getElementsByTagName() { return [firstScript]; },
    addEventListener() {}
  };
  const window = {
    document, dataLayer: [],
    localStorage: {
      getItem(key) { return values.get(key) || null; },
      setItem(key, value) { values.set(key, value); }
    }
  };
  vm.runInNewContext(source, { window, document, Object });
  return { window, values, inserted };
}

test('unknown or denied consent does not load Meta', () => {
  for (const choice of [null, 'denied']) {
    const result = fixture(choice);
    assert.equal(result.inserted.length, 0);
    assert.equal(result.window.fbq, undefined);
  }
});

test('grant loads the configured Meta destination once and records Google consent', () => {
  const result = fixture();
  result.window.SolynxTrackingConsent.grant();
  result.window.SolynxTrackingConsent.grant();
  assert.equal(result.values.get('solynx_analytics_consent'), 'granted');
  assert.equal(result.inserted.length, 1);
  assert.equal(result.inserted[0].id, 'solynx-meta-pixel');
  assert.equal(result.inserted[0].src, 'https://connect.facebook.net/en_US/fbevents.js');
  assert.equal(JSON.stringify(result.window.dataLayer.at(-1)), JSON.stringify(['consent', 'update', {
    analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted'
  }]));
  assert.deepEqual(Array.from(result.window.fbq.queue[1]), ['init', '1644858803494667']);
  assert.deepEqual(Array.from(result.window.fbq.queue[2]), ['track', 'PageView']);
});

test('denial updates Google consent and revokes an initialized Meta queue', () => {
  const result = fixture('granted');
  result.window.SolynxTrackingConsent.deny();
  assert.equal(result.values.get('solynx_analytics_consent'), 'denied');
  assert.equal(JSON.stringify(result.window.dataLayer.at(-1)), JSON.stringify(['consent', 'update', {
    analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'
  }]));
  assert.deepEqual(Array.from(result.window.fbq.queue.at(-1)), ['consent', 'revoke']);
});

test('Media establishes all denied defaults before GTM for unknown, declined, invalid or unavailable storage', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'digital-media-tech', 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const bootstrapIndex = scripts.findIndex(([, , body]) => body.includes('GTM-PV9442HN'));
  assert.equal(bootstrapIndex, 1);
  assert.equal(scripts.filter(([, attributes]) => attributes.includes('/js/solynx-tracking-consent.js')).length, 1);
  assert.equal((html.match(/googletagmanager\.com\/gtm\.js/g) || []).length, 1);
  assert.equal(/fbevents\.js|facebook\.com\/tr|googletagmanager\.com\/ns\.html/.test(html), false);
  for (const choice of [null, 'denied', 'invalid', 'granted', 'throws']) {
    const window = { dataLayer: [] };
    const localStorage = { getItem() { if (choice === 'throws') throw Error('blocked'); return choice; } };
    const context = vm.createContext({ window, dataLayer: window.dataLayer, localStorage });
    vm.runInContext(scripts[0][2], context);
    const command = Array.from(window.dataLayer[0]);
    assert.deepEqual(command.slice(0, 2), ['consent', 'default']);
    const expected = choice === 'granted' ? 'granted' : 'denied';
    for (const key of ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization']) {
      assert.equal(command[2][key], expected);
    }
  }
});

test('a withdrawn choice stays denied on a fresh page and regrant does not duplicate Meta initialization', () => {
  const result = fixture('granted');
  result.window.SolynxTrackingConsent.deny();
  const reloaded = fixture(result.values.get('solynx_analytics_consent'));
  assert.equal(reloaded.inserted.length, 0);
  assert.equal(reloaded.window.fbq, undefined);
  result.window.SolynxTrackingConsent.grant();
  assert.equal(result.inserted.length, 1);
  const commands = result.window.fbq.queue.map(command => Array.from(command));
  assert.equal(commands.filter(command => command[0] === 'init').length, 1);
  assert.equal(commands.filter(command => command[0] === 'track' && command[1] === 'PageView').length, 1);
});
