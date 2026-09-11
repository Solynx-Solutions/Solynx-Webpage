const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(
  path.join(root, "css", "google-reviews-preview.css"),
  "utf8",
);
const sectionMatch = html.match(
  /<section[^>]+id="customer-reviews"[\s\S]*?<\/section>/,
);

assert.ok(sectionMatch, "customer reviews section must exist");
const section = sectionMatch[0];

assert.match(
  section,
  /Built on results\.<\/span>\s*<span[^>]*>Backed by owners\.<\/span>/,
);
assert.match(section, /Dennis Hernandez/);
assert.match(section, /Master Scapes · SOLYNX client/);
assert.match(html, /The team is responsive\./);
assert.match(
  section,
  /Solynx has been a game-changer for us\. Their innovative solutions have made our operations more efficient and secure\. The team is responsive, and the platform is top-notch\. Highly recommend them!/
);
assert.match(section, /google\.com\/maps\?cid=15147860888115817840/);
assert.match(section, /Verified Customer Review/);
assert.doesNotMatch(section, /Chris Weigart|Diana Lee/i);
assert.doesNotMatch(section, /Verified Google Review/i);
assert.doesNotMatch(section, /\b\d+\s+reviews?\b|five-star customer feedback/i);
assert.match(html, /LeadConnector\.autoOpen\s*=\s*false/);
assert.match(html, /LeadConnector\.autoGreeting\s*=\s*false/);
assert.match(css, /html:not\(\.solynx-chat-requested\) \.lc_text-widget--prompt\s*\{[^}]*display:\s*none\s*!important/s);
assert.match(css, /scroll-margin-top:\s*92px/);
assert.match(html, /document\.documentElement\.classList\.add\('solynx-chat-requested'\)/);
assert.match(html, /prompt\.style\.removeProperty\('display'\)/);
assert.match(html, /#lc_text-widget--box\.active/);
assert.match(html, /box\.style\.removeProperty\('display'\)/);

console.log("reviews release synthetic checks passed");
