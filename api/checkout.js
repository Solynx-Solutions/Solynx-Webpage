// api/checkout.js — Vercel Serverless Function
// Stripe links stored in Vercel Environment Variables only — never in frontend code.

export default function handler(req, res) {
  const { plan, period } = req.query;

  let url = null;

  if (plan === "scout" && period === "monthly") {
    url = process.env.STRIPE_SCOUT_MONTHLY;
  }

  if (plan === "scout" && period === "annual") {
    url = process.env.STRIPE_SCOUT_ANNUAL;
  }

  if (plan === "prowler" && period === "monthly") {
    url = process.env.STRIPE_PROWLER_MONTHLY;
  }

  if (plan === "prowler" && period === "annual") {
    url = process.env.STRIPE_PROWLER_ANNUAL;
  }

  if (!url) {
    return res.status(400).send("Invalid plan or period.");
  }

  res.redirect(302, url);
}
