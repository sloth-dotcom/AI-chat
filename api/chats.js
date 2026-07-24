// Per-user chat history stored as one JSON document in the private Blob store.
const { readSession, userKey } = require("./_lib.js");
const { put, get } = require("@vercel/blob");

module.exports = async function handler(req, res) {
  const s = readSession(req);
  if (!s) {
    res.status(401).json({ error: "Ikke logget ind" });
    return;
  }
  const path = "chats/" + userKey(s.email) + ".json";

  if (req.method === "GET") {
    try {
      const result = await get(path, { access: "private", useCache: false });
      if (!result || !result.stream) {
        res.json({ threads: {} });
        return;
      }
      const text = await new Response(result.stream).text();
      const data = JSON.parse(text);
      res.json(data && typeof data === "object" ? data : { threads: {} });
    } catch (e) {
      // Not found (first login) or transient error → empty history.
      res.json({ threads: {} });
    }
    return;
  }

  if (req.method === "PUT") {
    const body = req.body;
    if (!body || typeof body !== "object" || typeof body.threads !== "object") {
      res.status(400).json({ error: "Ugyldigt indhold" });
      return;
    }
    const json = JSON.stringify({ threads: body.threads, savedAt: Date.now() });
    if (json.length > 2000000) {
      res.status(413).json({ error: "Historikken er for stor (maks 2 MB)." });
      return;
    }
    try {
      await put(path, json, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Kunne ikke gemme historikken: " + e.message });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
