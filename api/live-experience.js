/**
 * /api/live-experience.js
 * Vercel Serverless Function — SOLYNX Live Experience webhook proxy
 *
 * Receives form data from /live-experience/ and forwards it to the GHL
 * automation webhook. The webhook URL is stored as a Vercel environment
 * variable — NEVER hardcoded here.
 *
 * Environment variable required (set in Vercel → Project → Settings → Env):
 *   GHL_LIVE_EXPERIENCE_WEBHOOK_URL=https://services.leadconnectorhq.com/hooks/...
 *
 * Also add to .env.local for local development (never commit .env.local).
 */

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const webhookUrl = process.env.GHL_LIVE_EXPERIENCE_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error("GHL_LIVE_EXPERIENCE_WEBHOOK_URL is not set");
    return res.status(500).json({ error: "Server configuration error" });
  }

  try {
    const { name, email, phone, business, industry, automate_first } = req.body;

    // Basic validation
    if (!name || !email || !phone) {
      return res.status(400).json({ error: "Name, email, and phone are required" });
    }

    // Forward to GHL webhook
    const ghlResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone,
        business: business || "",
        industry: industry || "",
        automate_first: automate_first || "",
        source: "SOLYNX Live Experience",
        page_url: "https://solynx.solutions/live-experience/",
        timestamp: new Date().toISOString(),
      }),
    });

    if (!ghlResponse.ok) {
      const errorText = await ghlResponse.text();
      console.error("GHL webhook error:", ghlResponse.status, errorText);
      throw new Error("Upstream webhook failed");
    }

    return res.status(200).json({ success: true, message: "Experience activated" });

  } catch (err) {
    console.error("live-experience handler error:", err);
    return res.status(500).json({ error: "Failed to activate experience" });
  }
}
