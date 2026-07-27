// Serverless proxy to EU-selectable chat models. All three providers use
// OpenAI-compatible chat-completions APIs. Without MCP servers configured the
// upstream SSE stream is passed straight through; with MCP servers a tool-loop
// runs (model → MCP tools/call → model) and the final answer is emitted as SSE.
const { readSession } = require("./_lib.js");
const { loadServers, callTool } = require("./_mcp.js");

const PROVIDERS = {
  "GLM-5.2": {
    base: () => process.env.GLM_API_BASE || "https://api.z.ai/api/paas/v4",
    keyEnv: "GLM_API_KEY",
    model: () => process.env.GLM_MODEL || "glm-4.5-flash",
    // Zhipu-specific: skip the thinking phase so replies stream immediately.
    extra: { thinking: { type: "disabled" } },
  },
  "Kimi K3": {
    base: () => process.env.KIMI_API_BASE || "https://api.moonshot.ai/v1",
    keyEnv: "KIMI_API_KEY",
    model: () => process.env.KIMI_MODEL || "kimi-k3",
    // kimi-k3 is frequently overloaded; retry once on a stable sibling.
    fallbackModel: () => process.env.KIMI_FALLBACK_MODEL || "kimi-k2.6",
  },
  "Mistral (EU)": {
    base: () => process.env.MISTRAL_API_BASE || "https://api.mistral.ai/v1",
    keyEnv: "MISTRAL_API_KEY",
    model: () => process.env.MISTRAL_MODEL || "mistral-small-latest",
  },
};

const SYSTEM_PROMPT =
  "Du er en hjælpsom AI-assistent for en dansk virksomhed. " +
  "Svar klart og præcist på dansk, medmindre brugeren skriver på et andet sprog.";

// ---- Model-routing (gdpr-chat-router) ----
// "Auto" in the picker: the router chooses the cheapest good-enough tier per
// message; tiers map to the providers below. Fail-open UPWARD to Kimi (top).
const ROUTER_URL = process.env.ROUTER_URL || "https://gdpr-chat-router.vercel.app";
const ROUTER_TENANT = process.env.ROUTER_TENANT || "colourbox";
const TIER_TO_PROVIDER = {
  cheap: "GLM-5.2",
  mid: "Mistral (EU)",
  top: "Kimi K3",
};

async function routeAuto(chat, kb, conversationId) {
  const lastUser = [...chat].reverse().find((m) => m.role === "user");
  const kbChars = Array.isArray(kb)
    ? kb.reduce((n, d) => n + ((d && d.text) || "").length, 0)
    : 0;
  const r = await fetch(ROUTER_URL + "/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(5000),  // covers the router's serverless cold start
    body: JSON.stringify({
      tenant_id: ROUTER_TENANT,
      conversation_id: String(conversationId || "ai-chat"),
      message: (lastUser && lastUser.content) || "",
      context_meta: {
        conversation_depth: chat.length,
        rag_tokens: Math.floor(kbChars / 4),
        attachment_tokens: 0,
      },
    }),
  });
  if (!r.ok) throw new Error("router " + r.status);
  return r.json(); // { decision_id, model: tier, reason, ... }
}

function sseHeaders(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
}

function sseSend(res, obj) {
  res.write("data: " + JSON.stringify(obj) + "\n\n");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const sess = readSession(req);
  if (!sess) {
    res.status(401).json({ error: "Ikke logget ind — log ind for at chatte." });
    return;
  }

  const { messages, model, kb, threadId } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages mangler" });
    return;
  }

  const chat = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-40)
    .map((m) => ({ role: m.role, content: m.content }));

  // Resolve provider: the router's choice (Auto) or the user's manual pick.
  let providerName = model;
  let routing = null;
  if (model === "Auto") {
    try {
      const d = await routeAuto(chat, kb, threadId);
      providerName = TIER_TO_PROVIDER[d.model] || "Kimi K3";
      routing = { model: providerName, tier: d.model, reason: d.reason, decision_id: d.decision_id };
    } catch (e) {
      providerName = "Kimi K3"; // fail-open upward (asymmetry principle)
      routing = { model: providerName, tier: "top", reason: "failopen" };
    }
  }
  const provider = PROVIDERS[providerName] || PROVIDERS["GLM-5.2"];

  const key = process.env[provider.keyEnv];
  if (!key) {
    res.status(500).json({
      error:
        provider.keyEnv +
        " er ikke sat. Tilføj den under Vercel → Project → Settings → Environment Variables (eller `vercel env add " +
        provider.keyEnv +
        " production`) og deploy igen.",
    });
    return;
  }

  // Knowledge-base documents from the client become a second system message.
  const systemMessages = [{ role: "system", content: SYSTEM_PROMPT }];
  if (Array.isArray(kb) && kb.length) {
    let budget = 45000;
    let ctx =
      "Brugeren har en vidensbase med følgende dokumenter. Brug dem som kontekst, når det er relevant for spørgsmålet, og nævn dokumentets navn, når du bruger oplysninger fra det.\n";
    for (const d of kb.slice(0, 20)) {
      if (!d || typeof d.name !== "string" || typeof d.text !== "string") continue;
      const name = d.name.slice(0, 120);
      const text = d.text.slice(0, Math.max(0, budget));
      if (!text) {
        ctx += "\n[Dokument: " + name + "] (indhold udeladt — kontekstpladsen er brugt)\n";
        continue;
      }
      ctx += "\n[Dokument: " + name + "]\n" + text + "\n";
      budget -= text.length;
    }
    systemMessages.push({ role: "system", content: ctx });
  }

  // In Auto mode a persistently failing provider escalates UPWARD to the
  // next tier (never downward) — a rate-limited cheap model must never block
  // an answer. Manual picks stay on the chosen provider.
  const ESCALATION = { "GLM-5.2": "Mistral (EU)", "Mistral (EU)": "Kimi K3" };
  const providerChain = [providerName];
  if (model === "Auto") {
    let cur = providerName;
    while (ESCALATION[cur]) {
      cur = ESCALATION[cur];
      if (process.env[PROVIDERS[cur].keyEnv]) providerChain.push(cur);
    }
  }

  const makeCall = (prov, provKey, modelId, body) =>
    fetch(`${prov.base()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provKey}`,
      },
      body: JSON.stringify(Object.assign({ model: modelId }, prov.extra || {}, body)),
    });

  // Retries on transient errors (429/5xx), then sibling model, then — in
  // Auto mode — the next provider in the escalation chain.
  async function callWithFallback(body) {
    let status = 502;
    let detail = "";
    for (const provName of providerChain) {
      const prov = PROVIDERS[provName];
      const provKey = process.env[prov.keyEnv];
      const models = [prov.model()];
      if (prov.fallbackModel) models.push(prov.fallbackModel());
      for (const m of models) {
        for (let attempt = 0; attempt < 2; attempt++) {
          const upstream = await makeCall(prov, provKey, m, body);
          if (upstream.ok) return { upstream, provName };
          status = upstream.status;
          detail = await upstream.text().catch(() => "");
          if (status === 429 || status >= 500) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            continue; // transient — retry same model
          }
          break; // non-retryable — try next model/provider
        }
      }
    }
    return { upstream: null, status, detail };
  }

  // ---------- MCP tool definitions ----------
  let mcpServers = [];
  try {
    mcpServers = await loadServers(sess.email);
  } catch (e) { /* no integrations */ }

  const toolDefs = [];
  const toolMap = {};
  mcpServers.forEach((srv, si) => {
    (srv.tools || []).forEach((t) => {
      const fname = ("s" + si + "__" + t.name).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
      toolMap[fname] = { url: srv.url, name: t.name, label: srv.name };
      toolDefs.push({
        type: "function",
        function: {
          name: fname,
          description: String(t.description || "").slice(0, 1024),
          parameters: t.inputSchema || { type: "object", properties: {} },
        },
      });
    });
  });

  // ---------- Path 1: no MCP servers → stream passthrough ----------
  if (!toolDefs.length) {
    const r = await callWithFallback({ messages: [...systemMessages, ...chat], stream: true });
    if (!r.upstream) {
      res.status(r.status || 502).json({
        error: "Model-API'et (" + (model || "GLM-5.2") + ") svarede med fejl " + r.status,
        detail: (r.detail || "").slice(0, 500),
      });
      return;
    }
    if (routing && r.provName && r.provName !== routing.model) {
      routing.model = r.provName;
      routing.escalated = true;
    }
    sseHeaders(res);
    if (routing) sseSend(res, { routing });
    const reader = r.upstream.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } catch (err) {
      sseSend(res, { error: "stream afbrudt" });
    }
    res.end();
    return;
  }

  // ---------- Path 2: MCP tool loop ----------
  sseHeaders(res);
  if (routing) sseSend(res, { routing });
  const msgs = [...systemMessages, ...chat];
  try {
    for (let round = 0; round < 4; round++) {
      const lastRound = round === 3;
      const r = await callWithFallback({
        messages: msgs,
        stream: false,
        tools: lastRound ? undefined : toolDefs,
      });
      if (!r.upstream) {
        sseSend(res, { error: "Model-API'et svarede med fejl " + r.status + ": " + (r.detail || "").slice(0, 300) });
        break;
      }
      if (routing && r.provName && r.provName !== routing.model) {
        routing.model = r.provName;
        routing.escalated = true;
        sseSend(res, { routing });
      }
      const data = await r.upstream.json();
      const msg = data.choices && data.choices[0] && data.choices[0].message;
      if (msg && Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
        msgs.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });
        for (const tc of msg.tool_calls.slice(0, 5)) {
          const meta = toolMap[tc.function && tc.function.name];
          sseSend(res, { status: "Bruger " + (meta ? meta.label + " · " + meta.name : "værktøj") + "…" });
          let out;
          if (!meta) {
            out = "Ukendt værktøj.";
          } else {
            try {
              const args = JSON.parse(tc.function.arguments || "{}");
              out = await callTool(meta.url, meta.name, args);
            } catch (e) {
              out = "Værktøjsfejl: " + e.message;
            }
          }
          msgs.push({ role: "tool", tool_call_id: tc.id, content: String(out || "").slice(0, 8000) });
        }
        continue;
      }
      const text = (msg && msg.content) || "";
      sseSend(res, { choices: [{ delta: { content: text } }] });
      break;
    }
  } catch (err) {
    sseSend(res, { error: "Fejl i værktøjs-loop: " + err.message });
  }
  res.write("data: [DONE]\n\n");
  res.end();
};
