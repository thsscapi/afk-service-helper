import { SPREADSHEET_ID, selectSheet, parseRoster, parseCsv } from "../src/sheet-import.js";

async function googleText(path) {
  const response = await fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/${path}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Google Sheets could not be read. Check that link viewing is still enabled.");
  return response.text();
}

export async function importSheet(options = {}) {
  const html = await googleText("htmlview");
  const sheets = [...html.matchAll(/items\.push\(\{name: ("(?:\\.|[^"\\])*"), pageUrl: .*?, gid: "(\d+)"/g)].map((match) => ({ name: JSON.parse(match[1]), gid: match[2] }));
  const sheet = selectSheet(sheets, options);
  const text = await googleText(`export?format=csv&range=H5:N47&gid=${sheet.gid}`);
  if (text.trimStart().startsWith("<")) throw new Error("Google returned an unreadable sheet. Check link viewing permissions.");
  const rows = parseCsv(text);
  return { sheet, settings: parseRoster(rows, options.buyer), warnings: ["Imported Res levels default to 10 and TL levels to 30. Check them before saving."] };
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") return response.status(405).json({ error: "Method not allowed" });
  try {
    const url = new URL(request.url, "http://localhost");
    response.status(200).json(await importSheet(Object.fromEntries(url.searchParams)));
  } catch (error) {
    response.status(400).json({ error: error.message || "Import failed. Please try again." });
  }
}
