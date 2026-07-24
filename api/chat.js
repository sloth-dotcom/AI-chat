// Serverless proxy to EU-selectable chat models. All three providers use
// OpenAI-compatible chat-completions APIs with SSE streaming, so the response
// is passed straight through to the browser. API keys live in env vars and
// never reach the client.
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

const { readSession } = require("./_lib.js");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!readSession(req)) {
    res.status(401).json({ error: "Ikke logget ind — log ind for at chatte." });
    return;
  }

  const { messages, model, kb } = req.body || {};
  const provider = PROVIDERS[model] || PROVIDERS["GLM-5.2"];

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

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages mangler" });
    return;
  }

  const chat = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-40)
    .map((m) => ({ role: m.role, content: m.content }));

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

  const callUpstream = (modelId) =>
    fetch(`${provider.base()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [...systemMessages, ...chat],
        stream: true,
        ...(provider.extra || {}),
      }),
    });

  let upstream;
  try {
    upstream = await callUpstream(provider.model());
    if (!upstream.ok && provider.fallbackModel) {
      const detail = await upstream.text().catch(() => "");
      if (upstream.status === 429 && detail.includes("overloaded")) {
        upstream = await callUpstream(provider.fallbackModel());
      } else {
        res.status(upstream.status).json({
          error: "Model-API'et (" + (model || "GLM-5.2") + ") svarede med fejl " + upstream.status,
          detail: detail.slice(0, 500),
        });
        return;
      }
    }
  } catch (err) {
    res.status(502).json({ error: "Kunne ikke nå model-API'et: " + err.message });
    return;
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    res.status(upstream.status).json({
      error: "Model-API'et (" + (model || "GLM-5.2") + ") svarede med fejl " + upstream.status,
      detail: detail.slice(0, 500),
    });
    return;
  }

  // Pass the SSE stream straight through to the browser.
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } catch (err) {
    res.write('data: {"error":"stream afbrudt"}\n\n');
  }
  res.end();
};
