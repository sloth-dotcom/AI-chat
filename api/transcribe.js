// Speech-to-text via Mistral Voxtral (EU-hosted) — keeps the voice path
// inside the product's EU/GDPR story instead of the browser's Google-backed
// SpeechRecognition. Accepts a raw audio blob (application/octet-stream),
// forwards it as multipart to Mistral, returns { text }.
const { readSession } = require("./_lib.js");

const hits = new Map();
function allow(ip) {
  const now = Date.now();
  const h = (hits.get(ip) || []).filter((t) => now - t < 60 * 1000);
  if (h.length >= 10) return false;
  h.push(now);
  hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return true;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const sess = readSession(req);
  const isWidget = req.headers["x-widget"] === "1";
  if (!sess && !isWidget) {
    res.status(401).json({ error: "Ikke logget ind" });
    return;
  }
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "ukendt";
  if (!allow(ip)) {
    res.status(429).json({ error: "For mange optagelser — vent et øjeblik." });
    return;
  }

  const key = process.env.MISTRAL_API_KEY;
  if (!key) {
    res.status(500).json({ error: "MISTRAL_API_KEY er ikke sat." });
    return;
  }

  const audio = req.body;
  if (!audio || !Buffer.isBuffer(audio) || audio.length < 200) {
    res.status(400).json({ error: "Ingen lyd modtaget." });
    return;
  }
  if (audio.length > 8 * 1024 * 1024) {
    res.status(413).json({ error: "Optagelsen er for lang (maks 8 MB)." });
    return;
  }

  const mime = req.headers["x-audio-type"] || "audio/webm";
  const ext = mime.includes("mp4") ? "m4a" : mime.includes("wav") ? "wav" : "webm";
  const form = new FormData();
  form.append("file", new Blob([audio], { type: mime }), "tale." + ext);
  form.append("model", process.env.VOXTRAL_MODEL || "voxtral-mini-latest");

  try {
    const r = await fetch("https://api.mistral.ai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      res.status(502).json({ error: "Transskription fejlede (" + r.status + ")", detail: detail.slice(0, 300) });
      return;
    }
    const data = await r.json();
    res.json({ text: String(data.text || "").trim() });
  } catch (e) {
    res.status(502).json({ error: "Transskription fejlede: " + e.message });
  }
};
