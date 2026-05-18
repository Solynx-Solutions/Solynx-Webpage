const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/call", async (req, res) => {
  const { name, email, phone, business, industry } = req.body;

  console.log("🔥 INCOMING LEAD:", req.body);

  try {
    // 🔹 SEND TO GHL
    await axios.post("YOUR_GHL_WEBHOOK_URL", {
      name,
      email,
      phone,
      business,
      industry,
      source: "LYNX Chat Demo"
    });

    console.log("✅ Sent to GHL");

    // 🔹 TRIGGER AI CALL (PLACEHOLDER FOR NOW)
    await axios.post("YOUR_VOICE_API_URL", {
      phoneNumber: phone,
      agent: "lynx-chat",
      variables: {
        name,
        business,
        industry
      }
    }, {
      headers: {
        Authorization: "Bearer YOUR_API_KEY",
        "Content-Type": "application/json"
      }
    });

    console.log("📞 CALL TRIGGERED");

    res.json({ success: true });

  } catch (err) {
    console.error("❌ ERROR:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed" });
  }
});

app.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});