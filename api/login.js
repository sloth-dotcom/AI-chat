const { sha256, makeSession, sessionCookie, sessionUser } = require("./_lib.js");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!process.env.AUTH_EMAIL || !process.env.AUTH_PASSWORD_SHA256 || !process.env.AUTH_SECRET) {
    res.status(500).json({ error: "Login er ikke konfigureret (AUTH_* env-variabler mangler)." });
    return;
  }
  const { email, password } = req.body || {};
  const okEmail = String(email || "").trim().toLowerCase() === process.env.AUTH_EMAIL.toLowerCase();
  const okPass = sha256(String(password || "")) === process.env.AUTH_PASSWORD_SHA256.toLowerCase();
  if (!okEmail || !okPass) {
    res.status(401).json({ error: "Forkert e-mail eller adgangskode." });
    return;
  }
  const user = sessionUser();
  res.setHeader("Set-Cookie", sessionCookie(makeSession(user.email), 30 * 24 * 3600));
  res.json({ ok: true, user });
};
