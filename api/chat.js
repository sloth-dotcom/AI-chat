// Serverless proxy to the GLM chat-completions API (Z.ai / Zhipu, OpenAI-compatible).
// The API key lives in the GLM_API_KEY env var and never reaches the browser.
const API_BASE = process.env.GLM_API_BASE || "https://api.z.ai/api/paas/v4";
const DEFAULT_MODEL = process.env.GLM_MODEL || "glm-4.6";

// UI picker id → real API model id. Unknown ids fall back to DEFAULT_MODEL.
const MODEL_MAP = {
  "GLM-5.2": DEFAULT_MODEL,
};

const SYSTEM_PROMPT =
  "Du er en hjælpsom AI-assistent for en dansk virksomhed. " +
  "Svar klart og præcist på dansk, medmindre brugeren skriver på et andet sprog.";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const key = process.env.GLM_API_KEY;
  if (!key) {
    res.status(500).json({
      error:
        "GLM_API_KEY er ikke sat. Tilføj den under Vercel → Project → Settings → Environment Variables (eller `vercel env add GLM_API_KEY production`) og deploy igen.",
    });
    return;
  }

  const { messages, model } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages mangler" });
    return;
  }

  const chat = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-40)
    .map((m) => ({ role: m.role, content: m.content }));

  let upstream;
  try {
    upstream = await fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL_MAP[model] || DEFAULT_MODEL,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...chat],
        stream: true,
      }),
    });
  } catch (err) {
    res.status(502).json({ error: "Kunne ikke nå GLM-API'et: " + err.message });
    return;
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    res.status(upstream.status).json({
      error: "GLM-API'et svarede med fejl " + upstream.status,
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
