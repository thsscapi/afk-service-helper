export const SPREADSHEET_ID = "1CxgKwh2QRntqOtznnSmLq5LmOSo1kSYSQox9jOLYaO8";

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\n")) {
      row.push(field); field = "";
      if (char === "\n") { rows.push(row); row = []; }
    } else if (char !== "\r" || quoted) field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function sheetDate(name) {
  const match = name.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : null;
}

export function selectSheet(sheets, { gid, date, today } = {}) {
  if (gid) {
    const match = String(gid).match(/(?:gid=)?(\d+)$/);
    if (!match) throw new Error("Enter a numeric GID or a sheet URL ending in gid=….");
    const sheet = sheets.find((entry) => entry.gid === match[1]);
    if (!sheet) throw new Error("That GID was not found in this spreadsheet.");
    return sheet;
  }
  const target = date || today || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const matches = sheets.filter((sheet) => sheetDate(sheet.name) === target);
  if (matches.length > 1) throw new Error("More than one tab matches this date. Select the run using its GID.");
  if (matches.length) return matches[0];
  if (date) throw new Error("No tab matches the selected date. Try its GID instead.");
  const dated = sheets.filter((sheet) => sheetDate(sheet.name)).sort((a, b) => sheetDate(b.name).localeCompare(sheetDate(a.name)));
  const fallback = dated[0] || sheets[0];
  if (!fallback) throw new Error("No sheet tabs were found.");
  return fallback;
}

export function parseRoster(rows, buyerNumber = 1) {
  const cell = (row, column) => String(rows[row - 5]?.[column] ?? "").trim();
  const buyerRow = Number(buyerNumber) === 2 ? 47 : 46;
  const buyerName = cell(buyerRow, 0);
  if (!buyerName) throw new Error(`Buyer ${buyerNumber} is empty in H${buyerRow}.`);
  const resUsers = [10, 20].map((row, index) => ({ id: index ? "resB" : "resA", name: cell(row, 0), main: true, level: 10, party: index ? "main2" : "main1", sed: /\bsed\b/i.test(cell(row, 6)) }));
  if (resUsers.some((entry) => !entry.name)) throw new Error("A main Bishop name is missing in H10 or H20.");
  if (!resUsers.some((entry) => entry.sed)) resUsers[0].sed = true;
  if (resUsers.every((entry) => entry.sed)) resUsers[1].sed = false;
  if (/\bbish(?:op)?\b/i.test(cell(buyerRow, 3))) resUsers.push({ id: "resBuyerSheet", name: buyerName, main: false, backup: true, ownerBuyer: true, party: "mules", level: 10 });
  const tlUsers = [];
  const seen = new Set();
  for (const [start, end, party, columns] of [[5, 10, "main1", [3]], [15, 20, "main2", [3, 4]], [26, 31, "mules", [3]]]) {
    for (let row = start; row <= end; row++) {
      const name = cell(row, 0);
      if (!name || seen.has(name.toLowerCase()) || !columns.some((column) => /\bbuccaneer\b/i.test(cell(row, column)))) continue;
      seen.add(name.toLowerCase());
      const index = tlUsers.length;
      tlUsers.push({ id: index < 2 ? (index ? "tlB" : "tlA") : `tlSheet${row}`, name, main: index < 2, party, level: 30 });
    }
  }
  return { buyerName, resUsers, tlUsers };
}
