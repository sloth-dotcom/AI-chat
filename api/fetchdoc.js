// Import af offentlige Google Docs/Sheets til vidensbasen. Serveren henter
// dokumentets export-udgave (txt/csv) — virker for dokumenter delt med
// "Alle med linket kan se". Private dokumenter kræver OAuth (ikke i v1).
const { readSession } = require("./_lib.js");

const DOC_RE = /^https:\/\/docs\.google\.com\/document\/d\/([\w-]+)/;
const SHEET_RE = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!readSession(req)) {
    res.status(401).json({ error: "Ikke logget ind" });
    return;
  }
  const url = String((req.body || {}).url || "").trim();
  let exportUrl = null;
  let kind = null;
  const doc = url.match(DOC_RE);
  const sheet = url.match(SHEET_RE);
  if (doc) {
    exportUrl = `https://docs.google.com/document/d/${doc[1]}/export?format=txt`;
    kind = "Google Doc";
  } else if (sheet) {
    exportUrl = `https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=csv`;
    kind = "Google Sheet";
  } else {
    res.status(400).json({ error: "Indsæt et link til et Google Docs- eller Sheets-dokument (docs.google.com/…)." });
    return;
  }

  try {
    const r = await fetch(exportUrl, { redirect: "follow", signal: AbortSignal.timeout(20000) });
    const ct = r.headers.get("content-type") || "";
    if (!r.ok || ct.includes("text/html")) {
      res.status(403).json({
        error: "Kunne ikke hente dokumentet. Tjek at det er delt med “Alle med linket kan se” — private dokumenter kan ikke importeres.",
      });
      return;
    }
    let text = await r.text();
    text = text.replace(/^﻿/, "").trim();
    if (!text) {
      res.status(422).json({ error: "Dokumentet ser tomt ud." });
      return;
    }
    if (text.length > 30000) text = text.slice(0, 30000) + "\n… [afkortet]";

    // Navn fra content-disposition hvis muligt, ellers fra dokument-id.
    let name = kind;
    const cd = r.headers.get("content-disposition") || "";
    const m = cd.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    if (m) {
      try { name = decodeURIComponent(m[1]).replace(/\.(txt|csv)$/i, ""); } catch (e) { /* behold kind */ }
    }
    res.json({ name: name.slice(0, 80), text, size: text.length, kind });
  } catch (e) {
    res.status(502).json({ error: "Kunne ikke hente dokumentet: " + e.message });
  }
};
