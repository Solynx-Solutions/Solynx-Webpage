const { chromium } = require('C:/Users/rafae/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const pageUrl = process.env.DIGITAL_MEDIA_TEST_URL || 'http://127.0.0.1:4177/digital-media-tech/';
const outputRoot = path.resolve(__dirname, '..', '..', 'output');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const results = [];
  try {
    for (const viewport of [
      { name: 'desktop', width: 1440, height: 1000 },
      { name: 'mobile', width: 390, height: 844 }
    ]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });

      const photography = page.locator('[data-scope-id="photography"]');
      await photography.click();
      assert.equal(await photography.getAttribute('aria-pressed'), 'true');
      assert.match(await photography.locator('em').textContent(), /Selected/);
      assert.equal(await page.locator('#scopeCount').textContent(), '1');
      assert.equal(await page.locator('#selectionAssist').isVisible(), true);
      assert.equal(await page.locator('#selectionAssistCount').textContent(), '1 selected');
      assert.match(await page.locator('#navProjectLink').getAttribute('aria-label'), /1 selected item$/);
      assert.match(await page.locator('#selectionAnnouncement').textContent(), /Photography.*selected.*1 selected item/i);

      await page.locator('#selectionAssistLink').click();
      assert.equal(await page.locator('#project-summary').evaluate(element => document.activeElement === element), true);

      await page.locator('[data-scope-id="drone"]').click();
      assert.equal(await page.locator('#scopeCount').textContent(), '2');
      await page.locator('[data-scope-id="customer-story"]').click();
      assert.equal(await page.locator('#scopeCount').textContent(), '1');
      assert.match(await page.locator('#projectList').textContent(), /Customer story project/);
      assert.equal(await page.locator('#scopeNativeForm').isHidden(), true);
      assert.equal(await page.locator('#scopeNativeForm').getAttribute('src'), null);
      assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);

      const screenshot = path.join(outputRoot, `digital-media-ux-candidate-${viewport.name}-20261105.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      results.push({ viewport: viewport.name, screenshot, selectedCount: 1, formOpened: false, pageErrors });
      await context.close();
    }
    console.log(JSON.stringify({ ok: true, pageUrl, results }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
