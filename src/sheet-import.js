export const DEFAULT_MAPPING = {
  buyerNames: "H46,H47", buyerJobs: "K46,K47",
  resNames: "H10,H20", sedNotes: "N10,N20",
  tlNames: "H", tlMain1: "K5:K10", tlMain2: "K15:L20", tlMules: "K26:K31",
  resLevel: 10, tlLevel: 30,
};

export function spreadsheetId(value) {
  const text = String(value || "").trim();
  const match = text.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)(?:[/?#].*)?$/) || text.match(/^([\w-]{20,200})$/);
  if (!match) throw new Error("Paste a Google Sheets URL or spreadsheet ID.");
  return match[1];
}

function position(value) {
  const match = String(value).trim().toUpperCase().match(/^([A-Z]{1,2})([1-9]\d{0,2})$/);
  if (!match) throw new Error(`Invalid cell: ${value}. Use a cell such as H46.`);
  const column = [...match[1]].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0);
  if (column > 52 || Number(match[2]) > 500) throw new Error("Mappings must stay within A1:AZ500.");
  return { column, row: Number(match[2]) };
}

export function validateMapping(input = {}) {
  const map = { ...DEFAULT_MAPPING, ...input };
  for (const key of ["buyerNames", "buyerJobs", "resNames", "sedNotes"]) {
    map[key] = String(map[key]).split(",").map(value => value.trim().toUpperCase());
    if (map[key].length > 8 || (key === "resNames" && map[key].length !== 2)) throw new Error("Specify two main Bishop cells and up to eight buyers.");
    map[key].forEach(value => { if (value) position(value); });
  }
  if (!map.buyerNames.every(Boolean) || !map.resNames.every(Boolean)) throw new Error("Buyer and Bishop name cells cannot be empty.");
  map.tlNames = String(map.tlNames).trim().toUpperCase();
  if (!/^[A-Z]{1,2}$/.test(map.tlNames)) throw new Error("TL name column must be a column letter such as H.");
  position(`${map.tlNames}1`);
  for (const key of ["tlMain1", "tlMain2", "tlMules"]) {
    if (!String(map[key]).trim()) { map[key] = null; continue; }
    const parts = String(map[key]).toUpperCase().split(":");
    if (parts.length !== 2) throw new Error("TL job ranges must look like K5:K10. Leave unused groups empty.");
    const start = position(parts[0]), end = position(parts[1]);
    if (end.row < start.row || end.column < start.column) throw new Error("TL ranges must run from top-left to bottom-right.");
    map[key] = { start, end };
  }
  map.resLevel = Number(map.resLevel); map.tlLevel = Number(map.tlLevel);
  if (!Number.isInteger(map.resLevel) || map.resLevel < 1 || map.resLevel > 10 || !Number.isInteger(map.tlLevel) || map.tlLevel < 1 || map.tlLevel > 30) throw new Error("Use Res level 1–10 and TL level 1–30.");
  return map;
}

export function mappingRange(map) {
  const points = [...map.buyerNames, ...map.buyerJobs, ...map.resNames, ...map.sedNotes].filter(Boolean).map(position);
  for (const key of ["tlMain1", "tlMain2", "tlMules"]) if (map[key]) points.push(map[key].start, map[key].end, position(`${map.tlNames}${map[key].end.row}`));
  const lastRow = Math.max(...points.map(point => point.row));
  const lastColumn = Math.max(...points.map(point => point.column));
  if (lastRow * lastColumn > 15000) throw new Error("The configured cells span too large an area. Keep them within 15,000 cells.");
  let number = lastColumn, letters = "";
  while (number) { number--; letters = String.fromCharCode(65 + number % 26) + letters; number = Math.floor(number / 26); }
  return `A1:${letters}${lastRow}`;
}

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

export function parseRoster(rows, buyerNumber = 1, mapping = null) {
  const map = validateMapping(mapping || {});
  const cell = (address) => {
    if (!address) return "";
    const point = position(address);
    return String(rows[point.row - (mapping ? 1 : 5)]?.[point.column - (mapping ? 1 : 8)] ?? "").trim();
  };
  const buyerIndex = Number(buyerNumber) - 1;
  if (!Number.isInteger(buyerIndex) || !map.buyerNames[buyerIndex]) throw new Error("Select a configured buyer.");
  const buyerName = cell(map.buyerNames[buyerIndex]);
  if (!buyerName) throw new Error(`Buyer ${buyerNumber} is empty in ${map.buyerNames[buyerIndex]}.`);
  const resUsers = map.resNames.map((address, index) => ({ id: index ? "resB" : "resA", name: cell(address), main: true, level: map.resLevel, party: index ? "main2" : "main1", sed: /\bsed\b/i.test(cell(map.sedNotes[index])) }));
  if (resUsers.some((entry) => !entry.name)) throw new Error("A main Bishop name is missing. Check your name-cell mappings.");
  if (!resUsers.some((entry) => entry.sed)) resUsers[0].sed = true;
  if (resUsers.every((entry) => entry.sed)) resUsers[1].sed = false;
  if (/\bbish(?:op)?\b/i.test(cell(map.buyerJobs[buyerIndex]))) resUsers.push({ id: "resBuyerSheet", name: buyerName, main: false, backup: true, ownerBuyer: true, party: "mules", level: map.resLevel });
  const tlUsers = [];
  const seen = new Set();
  for (const [key, party] of [["tlMain1", "main1"], ["tlMain2", "main2"], ["tlMules", "mules"]]) {
    if (!map[key]) continue;
    const { start, end } = map[key];
    for (let row = start.row; row <= end.row; row++) {
      const name = cell(`${map.tlNames}${row}`);
      let isBucc = false;
      for (let column = start.column; column <= end.column; column++) {
        const value = rows[row - (mapping ? 1 : 5)]?.[column - (mapping ? 1 : 8)];
        if (/\bbuccaneer\b/i.test(String(value || ""))) isBucc = true;
      }
      if (!name || seen.has(name.toLowerCase()) || !isBucc) continue;
      seen.add(name.toLowerCase());
      const index = tlUsers.length;
      tlUsers.push({ id: index < 2 ? (index ? "tlB" : "tlA") : `tlSheet${row}`, name, main: index < 2, party, level: map.tlLevel });
    }
  }
  return { buyerName, resUsers, tlUsers };
}
