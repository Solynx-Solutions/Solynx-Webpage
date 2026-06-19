/**
 * /api/lions-all-star-lead.js
 * Vercel Serverless Function — Lions All-Star Football Game lead capture proxy
 *
 * Receives form submissions from /lions-all-star/ and forwards them to the
 * automation webhook. The webhook URL is stored as a Vercel environment
 * variable — NEVER hardcoded here.
 *
 * Environment variable required (set in Vercel → Project → Settings → Env):
 *   LIONS_ALL_STAR_WEBHOOK_URL=https://services.leadconnectorhq.com/hooks/...
 *
 * Also add to .env.local for local development (never commit .env.local).
 */

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const webhookUrl = process.env.LIONS_ALL_STAR_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error("LIONS_ALL_STAR_WEBHOOK_URL is not set");
    return res.status(500).json({ error: "Server configuration error" });
  }

  try {
    const {
      first_name,
      last_name,
      email,
      phone,
      interest,
      business_or_organization,
      message,
      utm_source,
      utm_medium,
      utm_campaign,
    } = req.body;

    // Server-side validation — required fields
    if (!first_name || !last_name || !email || !phone || !interest) {
      return res.status(400).json({
        error: "First name, last name, email, phone, and interest are required",
      });
    }

    const submittedAt = new Date().toISOString();

    // Build the webhook payload
    const payload = {
      source: "2026 Lions All-Star Football Game Landing Page",
      page_url: "https://www.solynx.solutions/lions-all-star/",
      event_name: "50th Annual Lions All-Star Football Game",
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      interest: interest.trim(),
      business_or_organization: (business_or_organization || "").trim(),
      message: (message || "").trim(),
      submitted_at: submittedAt,
      utm_source: (utm_source || "").trim(),
      utm_medium: (utm_medium || "").trim(),
      utm_campaign: (utm_campaign || "").trim(),
    };

    // Forward to webhook
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error(
        "Lions All-Star webhook error:",
        webhookResponse.status,
        errorText
      );
      throw new Error("Upstream webhook failed");
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("lions-all-star-lead handler error:", err);
    return res.status(500).json({ error: "Submission failed. Please try again." });
  }
}
