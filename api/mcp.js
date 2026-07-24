// CRUD for the user's configured MCP servers (Integrationer).
const { readSession } = require("./_lib.js");
const { listTools, loadServers, saveServers } = require("./_mcp.js");

function masked(s) {
  return {
    id: s.id,
    name: s.name,
    url: s.url.split("?")[0],
    tools: (s.tools || []).map(function (t) {
      return { name: t.name, description: String(t.description || "").slice(0, 140) };
    }),
  };
}

module.exports = async function handler(req, res) {
  const sess = readSession(req);
  if (!sess) {
    res.status(401).json({ error: "Ikke logget ind" });
    return;
  }

  if (req.method === "GET") {
    const servers = await loadServers(sess.email);
    res.json({ servers: servers.map(masked) });
    return;
  }

  if (req.method === "POST") {
    const { name, url } = req.body || {};
    if (!name || !url || !/^https:\/\//.test(String(url))) {
      res.status(400).json({ error: "Angiv et navn og en https-URL." });
      return;
    }
    let info;
    try {
      info = await listTools(String(url));
    } catch (e) {
      res.status(400).json({ error: "Kunne ikke forbinde til MCP-serveren: " + e.message });
      return;
    }
    if (!info.tools.length) {
      res.status(400).json({ error: "Serveren svarede, men udstiller ingen værktøjer." });
      return;
    }
    const servers = await loadServers(sess.email);
    if (servers.length >= 5) {
      res.status(400).json({ error: "Maks 5 MCP-servere — fjern en først." });
      return;
    }
    const entry = {
      id: "m" + Date.now(),
      name: String(name).slice(0, 40),
      url: String(url),
      addedAt: Date.now(),
      tools: info.tools.slice(0, 20).map(function (t) {
        return {
          name: t.name,
          description: String(t.description || "").slice(0, 1024),
          inputSchema: t.inputSchema || { type: "object", properties: {} },
        };
      }),
    };
    servers.push(entry);
    await saveServers(sess.email, servers);
    res.json({ ok: true, server: masked(entry) });
    return;
  }

  if (req.method === "DELETE") {
    const id = (req.body && req.body.id) || (req.query && req.query.id);
    if (!id) {
      res.status(400).json({ error: "id mangler" });
      return;
    }
    const servers = await loadServers(sess.email);
    await saveServers(sess.email, servers.filter(function (s) { return s.id !== id; }));
    res.json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
