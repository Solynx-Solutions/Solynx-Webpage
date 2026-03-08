export default function handler(req, res) {

  const plan = req.query.plan;
  const period = req.query.period;

  let redirectURL = null;

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
    return res.status(400).send("Invalid plan or period.");
  }

  res.writeHead(302, {
    Location: redirectURL
  });

  res.end();

}
