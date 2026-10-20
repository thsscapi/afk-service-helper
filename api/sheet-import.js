import { spreadsheetId, selectSheet, parseRoster, parseCsv, validateMapping, mappingRange } from "../src/sheet-import.js";

async function googleText(id, path) {
  const response = await fetch(`https://docs.google.com/spreadsheets/d/${id}/${path}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Google Sheets could not be read. Check that link viewing is still enabled.");
  return response.text();
}

export async function importSheet(options = {}) {
  const id = spreadsheetId(options.spreadsheet);
  const mapping = options.mapping || {};
  const range = mappingRange(validateMapping(mapping));
  const html = await googleText(id, "htmlview");
  const sheets = [...html.matchAll(/items\.push\(\{name: ("(?:\\.|[^"\\])*"), pageUrl: .*?, gid: "(\d+)"/g)].map((match) => ({ name: JSON.parse(match[1]), gid: match[2] }));
  const sheet = selectSheet(sheets, options);
  const text = await googleText(id, `export?format=csv&range=${encodeURIComponent(range)}&gid=${sheet.gid}`);
  if (text.trimStart().startsWith("<")) throw new Error("Google returned an unreadable sheet. Check link viewing permissions.");
  const rows = parseCsv(text);
  return { sheet, settings: parseRoster(rows, options.buyer || 1, mapping), warnings: ["Skill levels use your connection defaults. Check them before saving."] };
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ error: "Connect your own spreadsheet in Party Setup, then import using POST." });
  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    if (JSON.stringify(body || {}).length > 12000) throw new Error("Connection settings are too large.");
    response.status(200).json(await importSheet(body || {}));
  } catch (error) {
    response.status(400).json({ error: error.message || "Import failed. Please try again." });
  }
}
