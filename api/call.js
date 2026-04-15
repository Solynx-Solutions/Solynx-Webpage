function parseRequestBody(body) {
  if (!body) {
    return {};
  }

  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }

  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString("utf8"));
    } catch {
      return {};
    }
  }

  if (typeof body === "object") {
    return body;
  }

  return {};
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const payload = parseRequestBody(req.body);
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const phone = typeof payload.phone === "string" ? payload.phone.trim() : "";
  const business = typeof payload.business === "string" ? payload.business.trim() : "";
  const instructions = typeof payload.instructions === "string" ? payload.instructions.trim() : "";

  if (!name || !email || !phone) {
    return res.status(400).json({
      error: "name, email, and phone are required",
    });
  }

  return res.status(200).json({
    ok: true,
    lead: {
      name,
      email,
      phone,
      business,
      instructions,
    },
  });
};