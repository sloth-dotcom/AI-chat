const { readSession } = require("./_workLib.js");

module.exports = async function handler(req, res) {
  const s = readSession(req);
  if (!s) {
    res.status(401).json({ error: "Ikke logget ind" });
    return;
  }
  res.json({ ok: true, user: { email: s.email, name: s.name, picture: s.picture } });
};
