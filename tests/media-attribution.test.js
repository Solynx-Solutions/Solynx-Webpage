const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../digital-media-tech/menu.js'), 'utf8');

function openForm(search, inspect) {
  class Element {
    constructor() { this.handlers = {}; this.classList = { contains: () => false }; }
    addEventListener(name, fn) { this.handlers[name] = fn; }
    setAttribute() {}
    appendChild() {}
    querySelector() { return null; }
  }
  class Button extends Element {}
  class Frame extends Element {}
  class Anchor extends Element {}
  const option = new Button();
  option.getAttribute = name => ({'data-scope-id':'website', 'data-scope-label':'Website', 'data-selection-kind':'service'}[name] || '');
  const submit = new Button(), reset = new Button();
  const elements = Object.fromEntries(['projectList','projectEmpty','scopeCount','navScopeCount','scopeLeadStatus','scopeNativeFallback'].map(id => [id,new Element()]));
  elements.scopeNativeForm = new Frame(); elements.scopeNativeLink = new Anchor();
  const window = {location:{search}, dataLayer:[]};
  vm.runInNewContext(source, {
    URL, URLSearchParams, HTMLButtonElement: Button, HTMLIFrameElement: Frame, HTMLAnchorElement: Anchor,
    window,
    document: {
      querySelector: selector => selector === 'button#scopeSubmit' ? submit : selector === 'button#scopeReset' ? reset : null,
      querySelectorAll: () => [option], getElementById: id => elements[id], createElement: () => new Element()
    }
  });
  assert.equal(window.dataLayer.length, 0);
  option.handlers.click(); submit.handlers.click();
  if (inspect) inspect(window, submit);
  assert.equal(elements.scopeNativeForm.src, elements.scopeNativeLink.href);
  return new URL(elements.scopeNativeForm.src);
}
test('actual menu forwards campaign tags and selected brief to the fixed native receiver', () => {
  const url = openForm('?utm_source=google&utm_medium=organic&utm_campaign=gbp');
  assert.equal(url.origin, 'https://link.solynx.solutions');
  assert.equal(url.pathname, '/widget/form/1NHtVDOSdhAUtCKRcvo8');
  assert.equal(url.searchParams.get('utm_campaign'), 'gbp');
  assert.equal(url.searchParams.get('project_brief'), 'Selected services:\n- Website');
});
test('actual menu excludes contact fields and invalid campaign values', () => {
  const url = openForm('?email=private%40example.com&utm_source=private%40example.com&utm_campaign='+ 'x'.repeat(81));
  assert.deepEqual([...url.searchParams.keys()], ['project_brief']);
});
test('untagged visits do not invent campaign attribution', () => {
  assert.deepEqual([...openForm('').searchParams.keys()], ['project_brief']);
});

test('inquiry open records intent once without personal or campaign data', () => {
  openForm('?email=private%40example.com&utm_campaign=gbp', (window, submit) => {
    submit.handlers.click();
    assert.equal(window.dataLayer.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(window.dataLayer[0])), {
      event:'media_inquiry_open', form_id:'1NHtVDOSdhAUtCKRcvo8', selected_count:1
    });
  });
});
