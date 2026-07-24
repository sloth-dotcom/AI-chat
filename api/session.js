const { readSession, sessionUser } = require("./_lib.js");

module.exports = async function handler(req, res) {
  const s = readSession(req);
  if (!s) {
    res.status(401).json({ error: "Ikke logget ind" });
    return;
  }
  res.json({ ok: true, user: sessionUser() });
};
