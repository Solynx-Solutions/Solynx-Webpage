// api/checkout.js — Vercel Serverless Function (CommonJS)
// Stripe links are stored in Vercel Environment Variables — never in frontend code.

module.exports = function handler(req, res) {
  var plan = req.query.plan;
  var period = req.query.period;

  var redirectURL = null;

  if (plan === "scout" && period === "monthly") {
    redirectURL = process.env.STRIPE_SCOUT_MONTHLY;
  }

  if (plan === "scout" && period === "annual") {
    redirectURL = process.env.STRIPE_SCOUT_ANNUAL;
  }

  if (plan === "prowler" && period === "monthly") {
    redirectURL = process.env.STRIPE_PROWLER_MONTHLY;
  }

  if (plan === "prowler" && period === "annual") {
    redirectURL = process.env.STRIPE_PROWLER_ANNUAL;
  }

  if (!redirectURL) {
    res.status(400).send("Invalid plan or period.");
    return;
  }

  res.writeHead(302, { Location: redirectURL });
  res.end();
};
