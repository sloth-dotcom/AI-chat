// Kicks off the Google OAuth flow for the daily work-log app.
const crypto = require("crypto");
const { stateCookie } = require("./_workLib.js");

module.exports = async function handler(req, res) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    res.status(500).send("Google-login er ikke konfigureret (GOOGLE_CLIENT_ID mangler).");
    return;
  }
  const state = crypto.randomBytes(16).toString("hex");
  const proto = req.headers["x-forwarded-proto"] || "https";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${proto}://${req.headers.host}/api/google-callback`;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    access_type: "online",
  });

  res.setHeader("Set-Cookie", stateCookie(state, 600));
  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  res.end();
};
