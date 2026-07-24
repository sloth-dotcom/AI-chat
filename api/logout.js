const { sessionCookie } = require("./_lib.js");

module.exports = async function handler(req, res) {
  res.setHeader("Set-Cookie", sessionCookie("", 0));
  res.json({ ok: true });
};
