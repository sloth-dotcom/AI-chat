// Shared helpers for the daily work-log app (arbejdsopgaver.html): Google-login
// sessions plus a minimal CSV reader/writer. Sessions are stateless HMAC
// cookies signed with AUTH_SECRET, same scheme as the widget's own login but
// on a separate cookie so the two auth systems never collide.
const crypto = require("crypto");

const COOKIE = "wt_session";
const STATE_COOKIE = "wt_oauth_state";
const CSV_PATH = "arbejdsopgaver/opgaver.csv";
const CSV_HEADER = ["Dato", "Email", "Navn", "Opgave", "Registreret"];

function hmac(payload) {
  return crypto.createHmac("sha256", process.env.AUTH_SECRET || "").update(payload).digest("base64url");
}

function makeSession(user) {
  const payload = Buffer.from(
    JSON.stringify({
      email: user.email,
      name: user.name,
      picture: user.picture || "",
      exp: Date.now() + 30 * 24 * 3600 * 1000,
    })
  ).toString("base64url");
  return payload + "." + hmac(payload);
}

function readSession(req) {
  if (!process.env.AUTH_SECRET) return null;
  const raw = (req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
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

function cookie(name, value, maxAge) {
  return name + "=" + value + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge;
}

function sessionCookie(value, maxAge) {
  return cookie(COOKIE, value, maxAge);
}

function stateCookie(value, maxAge) {
  return cookie(STATE_COOKIE, value, maxAge);
}

function clearStateCookie() {
  return cookie(STATE_COOKIE, "", 0);
}

function readState(req) {
  const raw = (req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(STATE_COOKIE + "="));
  return raw ? raw.slice(STATE_COOKIE.length + 1) : null;
}

// Quote a field only when it needs it (contains a comma, quote or newline).
function csvEscape(field) {
  const s = String(field ?? "");
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function csvRow(fields) {
  return fields.map(csvEscape).join(",") + "\r\n";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

module.exports = {
  CSV_PATH,
  CSV_HEADER,
  makeSession,
  readSession,
  sessionCookie,
  stateCookie,
  clearStateCookie,
  readState,
  csvRow,
  parseCsv,
};
