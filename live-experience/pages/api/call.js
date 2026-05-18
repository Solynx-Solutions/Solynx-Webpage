export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const data = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

  await fetch("https://your-crm-webhook.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  await fetch("https://api.your-voice-provider.com/call", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.VOICE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: data.phone,
      agent_prompt: data.instructions || "Default demo script",
    }),
  });

  return res.status(200).json({ success: true });
}