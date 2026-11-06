const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../digital-media-tech/menu.js'), 'utf8');
const markup = fs.readFileSync(path.join(__dirname, '../digital-media-tech/index.html'), 'utf8');

test('landing uses the existing fail-closed contact-save endpoint without a login or duplicate receiver', () => {
  assert.match(source, /fetch\('\/api\/digital-media-lead'/);
  assert.match(source, /result\.saved !== true/);
  assert.match(markup, /No account or login is created/);
  assert.doesNotMatch(source, /widget\/form|scopeNativeForm|project_brief/);
});

test('approved prices are absent from public markup and client script before confirmed save', () => {
  const publicSource = markup + '\n' + source;
  for (const value of ['$7,000', '$4,000', '$2,750', '$1,200', '$1,000', '$750']) {
    assert.equal(publicSource.includes(value), false, value);
  }
  assert.match(source, /acceptPrices\(result\.prices\)/);
  assert.match(source, /approvedPricebook\.hidden = false/);
});

test('pricing gate forwards only established public campaign slugs and named optional qualifications', () => {
  assert.match(source, /attribution: campaignAttribution\(\)/);
  assert.match(source, /\^\[a-zA-Z0-9_-\]\{1,80\}\$/);
  assert.doesNotMatch(source, /location\.href|document\.referrer|query\.entries|query\.forEach|Object\.fromEntries\(query/);
  for (const key of ['intendedUse', 'deliveryChannels', 'footageReadiness', 'usageRights', 'decisionProcess']) {
    assert.match(markup, new RegExp('name="' + key + '" maxlength="300"'));
  }
  assert.match(source, /qualifiers: Object\.fromEntries/);
  assert.doesNotMatch(markup, /name="(?:intendedUse|deliveryChannels|footageReadiness|usageRights|decisionProcess)"[^>]*required/);
});

test('preferred contact method is submitted only as preference data', () => {
  assert.match(markup, /name="preferredContact"[^>]+value="email"/);
  assert.match(markup, /name="preferredContact"[^>]+value="phone"/);
  assert.match(markup, /name="preferredContact"[^>]+value="text"/);
  assert.match(markup, /does not subscribe you to marketing texts or send a text automatically/);
  assert.match(source, /preferredContact: form\.get\('preferredContact'\)/);
  assert.match(markup, /name="marketingConsent" type="checkbox"/);
  assert.match(markup, /existing communication preferences remain in place/);
  assert.match(source, /marketingConsent: form\.get\('marketingConsent'\) === 'yes'/);
});

test('package-first navigation has selectable packages and a separate individual-service path', () => {
  assert.match(markup, /href="#media-packages">Compare packages/);
  assert.match(markup, /href="#menu">Individual services/);
  assert.match(markup, /href="#process">How it works/);
  for (const id of ['launch-reel', 'story-session', 'signature-production']) {
    assert.match(markup, new RegExp(`data-scope-id="${id}"[^>]+data-selection-kind="package"`));
  }
  assert.match(markup, /Choose individual services/);
  assert.match(markup, /without a package or subscription/);
});

test('unverified package-to-rate mappings are not published', () => {
  assert.doesNotMatch(markup, /Starter\s*\/\s*Launch Reel|Lite\s*\/\s*Story Session|Alpha flagship\s*—\s*Signature Production/);
  assert.doesNotMatch(markup, /data-scope-id="(?:alpha|lite|starter)"/);
  assert.match(source, /provide a written quote for the work you selected/);
});

test('integrated project drawer carries exact selections without a duplicate chooser', () => {
  assert.match(markup, /<details class="projectPanel" id="project-summary">/);
  assert.doesNotMatch(markup, /<select|multiple/);
  assert.match(markup, /selected package and services are carried into this inquiry automatically/);
  assert.match(source, /selections: Array\.from\(selected\.values\(\)\)/);
  assert.match(source, /quantity: 1/);
  assert.match(source, /packageChoice:/);
});

test('monthly editing is optional, independent, and mutually exclusive', () => {
  assert.match(markup, /Optional monthly editing is independent from one-time production/);
  assert.match(markup, /Choose one monthly option or none/);
  assert.equal((markup.match(/data-selection-group="monthly-editing"/g) || []).length, 3);
  assert.match(source, /details\.group && item\.group === details\.group/);
});

test('misleading proposed assignments are replaced by a rights-held contribution ledger', () => {
  assert.doesNotMatch(markup, /Elkhorn seen from above|pool table back to life/);
  assert.match(markup, /WHA clay shoot/);
  assert.match(markup, /Raw coast footage only—not finished client work/);
  assert.match(markup, /Editing contribution only; no claim that SOLYNX captured the footage/);
  assert.match(markup, /MasterScapes website work remains on hold/);
});
