const { chromium } = require('C:/Users/rafae/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const pageUrl = process.env.DIGITAL_MEDIA_TEST_URL || 'http://127.0.0.1:4177/digital-media-tech/';
const outputRoot = path.resolve(__dirname, '..', '..', 'output');
const matchingPrices = {
  photography: { label: 'Photography', amount: 1000, display: '$1,000' }
};

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
      const submissions = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.route('**/api/digital-media-lead', async route => {
        if (route.request().method() === 'GET') {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ready: true }) });
          return;
        }
        submissions.push(route.request().postDataJSON());
        const selected = submissions.at(-1).items;
        const prices = Object.fromEntries(selected.filter(key => matchingPrices[key]).map(key => [key, matchingPrices[key]]));
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ saved: true, prices }) });
      });
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });

      assert.equal(await page.locator('#approvedPricebook').isHidden(), true);
      assert.equal((await page.locator('body').textContent()).includes('$7,000'), false);
      assert.equal(await page.locator('#media-packages').evaluate(el => el.previousElementSibling.classList.contains('definition')), true);
      assert.equal(await page.locator('#media-packages .packageSelect').count(), 3);
      await page.locator('[data-scope-id="launch-reel"]').click();
      assert.equal(await page.locator('#scopeCount').textContent(), '1');
      assert.match(await page.locator('#projectList').textContent(), /Launch Reel.*Custom quote/);
      await page.locator('[data-scope-id="photography"]').click();
      assert.equal(await page.locator('#scopeCount').textContent(), '1');
      assert.match(await page.locator('#projectList').textContent(), /Photography.*Unlock after saved contact/);
      assert.equal(await page.locator('#selectionAssist').isVisible(), true);
      await page.locator('#selectionAssistLink').click();
      assert.equal(await page.locator('#project-summary').getAttribute('open'), '');
      assert.equal(await page.locator('#selectionAssist').isHidden(), true);
      assert.equal(await page.locator('select').count(), 0);

      await page.locator('input[name="fullName"]').fill('Rendered QA');
      await page.locator('input[name="email"]').fill('rendered-qa@example.test');
      await page.locator('input[name="business"]').fill('SOLYNX QA');
      await page.locator('input[name="phone"]').fill('831-555-0100');
      await page.locator('input[name="preferredContact"][value="text"]').check();
      await page.locator('textarea[name="description"]').fill('Review the photography pricing flow.');
      await page.locator('#scopeSubmit').click();
      await page.locator('#approvedPricebook').waitFor({ state: 'visible' });

      assert.equal(submissions.length, 1);
      assert.deepEqual(submissions[0].items, ['photography']);
      assert.deepEqual(submissions[0].selections, [{ id: 'photography', quantity: 1, kind: 'service' }]);
      assert.equal(submissions[0].packageChoice, null);
      assert.equal(submissions[0].marketingConsent, false);
      assert.equal(submissions[0].preferredContact, 'text');
      assert.equal(Object.hasOwn(submissions[0], 'smsConsent'), false);
      assert.equal(await page.locator('#approvedPricebook').isVisible(), true);
      assert.match(await page.locator('#approvedPriceList').textContent(), /Photography.*\$1,000/s);
      assert.doesNotMatch(await page.locator('#approvedPriceList').textContent(), /Alpha|Lite|Starter/);
      assert.equal(await page.locator('#oneTimeTotal').textContent(), '$1,000');
      assert.match(await page.locator('#priceNextStep').textContent(), /agreement or MSA.*payment or deposit link.*Nothing is charged here/s);
      assert.match(await page.locator('#scopeLeadStatus').textContent(), /Saved.*no account or login/i);
      assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);

      const screenshot = path.join(outputRoot, `digital-media-package-first-${viewport.name}-20261105.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      const projectScreenshot = path.join(outputRoot, `digital-media-project-drawer-${viewport.name}-20261105.png`);
      await page.locator('#project-summary').screenshot({ path: projectScreenshot });
      results.push({ viewport: viewport.name, screenshot, projectScreenshot, selectedSubtotal: '$1,000', submissions: submissions.length, pageErrors });
      await context.close();
    }
    console.log(JSON.stringify({ ok: true, pageUrl, results }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
