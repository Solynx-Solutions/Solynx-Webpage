const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "services.html"), "utf8");

// QA screenshot (output/plan-finder-checkout-20261117/services-pricing-mobile.png)
// showed the GHL auto-greeting bubble covering the pricing-entry support
// copy/CTA on mobile. The previous forceClose() script called
// LeadConnector.closeWidget/close and LC_API.close_chat, none of which
// exist on this widget, so it never suppressed anything. This asserts the
// same render-blocking CSS + click-to-reveal JS already proven on
// index.html (and asserted by reviews-release.synthetic.test.js) is now
// present on services.html too.

assert.match(
  html,
  /html:not\(\.solynx-chat-requested\) \.lc_text-widget--prompt\s*\{[^}]*display:\s*none\s*!important/s,
  "render-blocking CSS rule to hide the auto-greeting prompt must be present",
);
assert.match(
  html,
  /document\.documentElement\.classList\.add\('solynx-chat-requested'\)/,
  "clicking the launcher must reveal the prompt by toggling the html class",
);
assert.match(html, /#lc_text-widget--btn/, "must bind to the real launcher id, not a guessed close API");
assert.match(html, /prompt\.style\.removeProperty\('display'\)/);
assert.match(html, /#lc_text-widget--box\.active/);
assert.match(html, /box\.style\.removeProperty\('display'\)/);

// The broken guessed-API approach must be fully removed, not left alongside
// the fix (would be dead code at best, conflicting behavior at worst).
assert.doesNotMatch(html, /forceClose/, "old non-functional suppression script must be removed");
assert.doesNotMatch(html, /closeWidget/, "old guessed close API call must be removed");
assert.doesNotMatch(html, /LC_API\.close_chat/, "old guessed close API call must be removed");

// The fix must not disable the widget/service itself.
assert.match(html, /widgets\.leadconnectorhq\.com\/loader\.js/, "chat widget loader must remain present");
assert.match(html, /data-widget-id="69b725f66660242869549e80"/, "chat widget id must be unchanged");
assert.match(html, /LeadConnector\.autoOpen\s*=\s*false/);
assert.match(html, /LeadConnector\.autoGreeting\s*=\s*false/);

// The pricing-entry section this was protecting must still be intact.
const pricingMatch = html.match(/<section id="pricing" class="pricing-section">[\s\S]*?<\/section>/);
assert.ok(pricingMatch, "pricing-entry section must still exist");
const pricingSection = pricingMatch[0];
assert.match(pricingSection, /Find Your Plan &amp; Pricing/);
assert.match(pricingSection, /Find My Plan &amp; Pricing/);
assert.match(pricingSection, /href="\/plan-fit"/);

console.log("services chat-widget overlap synthetic checks passed");
