// OAuth callback: exchanges the code for tokens, decodes the ID token (it
// came straight from Google's token endpoint over TLS, so no re-verification
// of the signature is needed) and opens a session for the app.
const { readState, clearStateCookie, makeSession, sessionCookie } = require("./_workLib.js");

module.exports = async function handler(req, res) {
  const { code, state, error } = req.query || {};

  if (error) {
    res.writeHead(302, { Location: "/arbejdsopgaver.html?fejl=" + encodeURIComponent(error) });
    res.end();
    return;
  }

  const expectedState = readState(req);
  if (!code || !state || !expectedState || state !== expectedState) {
    res.setHeader("Set-Cookie", clearStateCookie());
    res.writeHead(302, { Location: "/arbejdsopgaver.html?fejl=ugyldig_forespoergsel" });
    res.end();
    return;
  }

  const proto = req.headers["x-forwarded-proto"] || "https";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${proto}://${req.headers.host}/api/google-callback`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10000),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.id_token) {
      throw new Error(tokenData.error_description || tokenData.error || "Token-udveksling fejlede");
    }

    const idParts = String(tokenData.id_token).split(".");
    const payload = JSON.parse(Buffer.from(idParts[1], "base64url").toString());
    if (!payload.email) throw new Error("Google gav ingen e-mailadresse");

    const user = {
      email: String(payload.email).toLowerCase(),
      name: payload.name || payload.email,
      picture: payload.picture || "",
    };

    res.setHeader("Set-Cookie", [sessionCookie(makeSession(user), 30 * 24 * 3600), clearStateCookie()]);
    res.writeHead(302, { Location: "/arbejdsopgaver.html" });
    res.end();
  } catch (e) {
    res.setHeader("Set-Cookie", clearStateCookie());
    res.writeHead(302, { Location: "/arbejdsopgaver.html?fejl=" + encodeURIComponent(e.message) });
    res.end();
  }
};
