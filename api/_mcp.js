// Minimal generic MCP client over Streamable HTTP (JSON-RPC 2.0), plus
// per-user storage of configured MCP servers in the private Blob store.
const { userKey } = require("./_lib.js");
const { put, get } = require("@vercel/blob");

const PROTOCOL = "2025-03-26";

function parseSse(text) {
  // Return the first JSON-RPC message carrying a result or error.
  const events = text.split("\n\n");
  for (const ev of events) {
    const dataLines = ev.split("\n").filter((l) => l.startsWith("data:"));
    if (!dataLines.length) continue;
    const data = dataLines.map((l) => l.slice(5).trim()).join("");
    try {
      const j = JSON.parse(data);
      if (j && (j.result !== undefined || j.error !== undefined)) return j;
    } catch (e) { /* partial frame */ }
  }
  return null;
}

async function rpc(url, body, sessionId) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  const newSession = r.headers.get("mcp-session-id") || sessionId || null;
  const text = await r.text();
  if (!r.ok) throw new Error("MCP-serveren svarede " + r.status + ": " + text.slice(0, 200));
  let msg = null;
  if ((r.headers.get("content-type") || "").includes("text/event-stream")) {
    msg = parseSse(text);
  } else if (text.trim()) {
    try { msg = JSON.parse(text); } catch (e) { msg = null; }
  }
  return { msg, sessionId: newSession };
}

async function connect(url) {
  const init = await rpc(url, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "cbx-ai-chat", version: "1.0" } },
  });
  if (!init.msg || init.msg.error) {
    throw new Error("initialize fejlede: " + JSON.stringify((init.msg && init.msg.error) || "tomt svar").slice(0, 200));
  }
  await rpc(url, { jsonrpc: "2.0", method: "notifications/initialized" }, init.sessionId).catch(function () {});
  return { sessionId: init.sessionId, serverInfo: init.msg.result && init.msg.result.serverInfo };
}

async function listTools(url) {
  const c = await connect(url);
  const r = await rpc(url, { jsonrpc: "2.0", id: 2, method: "tools/list" }, c.sessionId);
  if (!r.msg || r.msg.error) throw new Error("tools/list fejlede");
  return { serverInfo: c.serverInfo, tools: (r.msg.result && r.msg.result.tools) || [] };
}

async function callTool(url, name, args) {
  const c = await connect(url);
  const r = await rpc(url, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: name, arguments: args || {} },
  }, c.sessionId);
  if (!r.msg) throw new Error("tomt svar fra MCP-serveren");
  if (r.msg.error) throw new Error(r.msg.error.message || "MCP-fejl");
  const content = (r.msg.result && r.msg.result.content) || [];
  return content.map(function (c2) { return c2.type === "text" ? c2.text : JSON.stringify(c2); }).join("\n");
}

// ---------- per-user server config in Blob ----------
function mcpPath(email) {
  return "mcp/" + userKey(email) + ".json";
}

async function loadServers(email) {
  try {
    const r = await get(mcpPath(email), { access: "private", useCache: false });
    if (!r || !r.stream) return [];
    const data = JSON.parse(await new Response(r.stream).text());
    return Array.isArray(data.servers) ? data.servers : [];
  } catch (e) {
    return [];
  }
}

async function saveServers(email, servers) {
  await put(mcpPath(email), JSON.stringify({ servers: servers }), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

module.exports = { connect, listTools, callTool, loadServers, saveServers };
