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

export function normalizePhone(value) {
  if (typeof value !== "string" || value.length > 30 || !/^\+?[\d ().-]+$/.test(value.trim())) return null;
  const input = value.trim();
  const digits = input.replace(/\D/g, "");
  if (input.startsWith("+") && !digits.startsWith("1")) return /^[2-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (input.startsWith("+") && digits.length !== 11) return null;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(national) ? `+1${national}` : null;
}

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
    const { name, email, phone: rawPhone, business, industry, automate_first, consent_sms } = req.body || {};
    const phone = normalizePhone(rawPhone);

    // Basic validation
    if (typeof name !== "string" || !name.trim() || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone || (consent_sms !== undefined && typeof consent_sms !== "boolean")) {
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
        consent_sms: consent_sms === true,
        sms_consent_version: "solynx-live-sms-v1-2026-09-25",
        sms_consent_source: "https://solynx.solutions/live-experience/",
        sms_consent_recorded_at: new Date().toISOString(),
      }),
    });

    if (!ghlResponse.ok) {
      console.error("GHL webhook error:", ghlResponse.status);
      throw new Error("Upstream webhook failed");
    }

    return res.status(200).json({ success: true, message: "Experience activated" });

  } catch (err) {
    console.error("live-experience handler error:", err);
    return res.status(500).json({ error: "Failed to activate experience" });
  }
}
