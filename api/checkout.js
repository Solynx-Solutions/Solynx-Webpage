// api/checkout.js — Vercel Serverless Function
// Stripe links are stored in Vercel Environment Variables, never in frontend code.
// Set these in the Vercel dashboard under: Project → Settings → Environment Variables

module.exports = function handler(req, res) {
  var plan   = (req.query.plan   || '').toLowerCase();
  var period = (req.query.period || '').toLowerCase();

  var links = {
    scout_monthly:   process.env.STRIPE_SCOUT_MONTHLY,
    scout_annual:    process.env.STRIPE_SCOUT_ANNUAL,
    prowler_monthly: process.env.STRIPE_PROWLER_MONTHLY,
    prowler_annual:  process.env.STRIPE_PROWLER_ANNUAL,
  };

  var key = plan + '_' + period;
  var url = links[key];

  if (!url) {
    res.status(400).send('Invalid plan or period.');
    return;
  }

  // Redirect the user to the Stripe checkout page
  res.redirect(302, url);
};
