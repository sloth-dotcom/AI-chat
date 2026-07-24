// Shared auth helpers for the serverless API. Sessions are stateless HMAC
// cookies signed with AUTH_SECRET; the single user is defined by AUTH_EMAIL +
// AUTH_PASSWORD_SHA256 env vars (no plaintext password anywhere).
const crypto = require("crypto");

const COOKIE = "cbx_session";

function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function hmac(payload) {
  return crypto.createHmac("sha256", process.env.AUTH_SECRET || "").update(payload).digest("base64url");
}

function makeSession(email) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + 30 * 24 * 3600 * 1000 })).toString("base64url");
  return payload + "." + hmac(payload);
}

function readSession(req) {
  if (!process.env.AUTH_SECRET) return null;
  const raw = (req.headers.cookie || "")
    .split(/;\s*/)
    .find((c) => c.startsWith(COOKIE + "="));
  if (!raw) return null;
  const val = raw.slice(COOKIE.length + 1);
  const dot = val.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = val.slice(0, dot);
  const sig = val.slice(dot + 1);
  const expect = hmac(payload);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.email || data.exp < Date.now()) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function sessionCookie(value, maxAge) {
  return COOKIE + "=" + value + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge;
}

function sessionUser() {
  return {
    email: (process.env.AUTH_EMAIL || "").toLowerCase(),
    name: process.env.AUTH_NAME || "Bruger",
    role: process.env.AUTH_ROLE || "",
  };
}

// Deterministic but unguessable per-user blob path.
function userKey(email) {
  return crypto.createHmac("sha256", process.env.AUTH_SECRET || "").update("chats:" + email).digest("hex");
}

module.exports = { COOKIE, sha256, makeSession, readSession, sessionCookie, sessionUser, userKey };
