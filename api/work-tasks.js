// Daily work-log entries, stored as one shared CSV file in the private Blob
// store (Dato,Email,Navn,Opgave,Registreret). Each user only ever sees their
// own rows; the blob is small enough that read-modify-write on every save is
// fine at this scale.
const { readSession, CSV_PATH, CSV_HEADER, csvRow, parseCsv } = require("./_workLib.js");
const { put, get } = require("@vercel/blob");

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function loadRows() {
  try {
    const result = await get(CSV_PATH, { access: "private", useCache: false });
    if (!result || !result.stream) return [];
    const text = await new Response(result.stream).text();
    const rows = parseCsv(text).filter((r) => r.length >= 5);
    if (rows.length && rows[0].join(",") === CSV_HEADER.join(",")) rows.shift();
    return rows;
  } catch (e) {
    // Not found (first save) or transient error → start from empty.
    return [];
  }
}

async function saveRows(rows) {
  const csv = CSV_HEADER.join(",") + "\r\n" + rows.map(csvRow).join("");
  await put(CSV_PATH, csv, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "text/csv",
  });
}

module.exports = async function handler(req, res) {
  const s = readSession(req);
  if (!s) {
    res.status(401).json({ error: "Ikke logget ind" });
    return;
  }

  if (req.method === "GET") {
    const rows = await loadRows();
    const mine = rows
      .filter((r) => (r[1] || "").toLowerCase() === s.email)
      .map((r) => ({ dato: r[0], opgave: r[3], registreret: r[4] }))
      .sort((a, b) => (a.dato + a.registreret < b.dato + b.registreret ? 1 : -1));
    res.json({ tasks: mine });
    return;
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const opgave = String(body.opgave || "").trim();
    let dato = String(body.dato || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dato)) dato = todayISO();
    if (!opgave) {
      res.status(400).json({ error: "Skriv en beskrivelse af opgaven." });
      return;
    }
    if (opgave.length > 2000) {
      res.status(400).json({ error: "Beskrivelsen er for lang (maks 2000 tegn)." });
      return;
    }

    const rows = await loadRows();
    rows.push([dato, s.email, s.name || s.email, opgave, new Date().toISOString()]);
    try {
      await saveRows(rows);
    } catch (e) {
      res.status(500).json({ error: "Kunne ikke gemme opgaven: " + e.message });
      return;
    }
    res.json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
