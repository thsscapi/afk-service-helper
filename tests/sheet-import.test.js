import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseRoster, selectSheet, spreadsheetId, validateMapping, mappingRange, DEFAULT_MAPPING } from "../src/sheet-import.js";
import handler, { importSheet } from "../api/sheet-import.js";

test("public importer requires an explicit Google spreadsheet and rejects the old GET route", async () => {
  assert.throws(() => spreadsheetId(""));
  assert.throws(() => spreadsheetId("https://example.com/spreadsheets/d/abc"));
  assert.throws(() => spreadsheetId("https://docs.google.com.evil.example/spreadsheets/d/abc"));
  assert.equal(spreadsheetId("https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz/edit#gid=1"), "abcdefghijklmnopqrstuvwxyz");
  await assert.rejects(importSheet({}), /Google Sheets URL/);
  let status, body;
  const response = { setHeader() {}, status(value) { status = value; return this; }, json(value) { body = value; return this; } };
  await handler({ method: "GET", url: "/api/sheet-import" }, response);
  assert.equal(status, 405);
  assert.match(body.error, /own spreadsheet/);
});

test("custom mappings read different columns, optional job cells, omitted TL groups and custom levels", () => {
  const rows = Array.from({ length: 12 }, () => []);
  rows[0][0] = "Buyer Custom"; rows[0][1] = "Bish";
  rows[1][0] = "Bishop Custom1"; rows[2][0] = "Bishop Custom2"; rows[2][1] = "Sed";
  rows[4][0] = "TL Custom"; rows[4][2] = "Buccaneer";
  const mapping = { ...DEFAULT_MAPPING, buyerNames: "A1", buyerJobs: "B1", resNames: "A2,A3", sedNotes: ",B3", tlNames: "A", tlMain1: "", tlMain2: "C5:C5", tlMules: "", resLevel: 8, tlLevel: 14 };
  assert.equal(mappingRange(validateMapping(mapping)), "A1:C5");
  const settings = parseRoster(rows, 1, mapping);
  assert.equal(settings.buyerName, "Buyer Custom");
  assert.equal(settings.resUsers[1].sed, true);
  assert.equal(settings.resUsers[2].ownerBuyer, true);
  assert.equal(settings.resUsers[0].level, 8);
  assert.equal(settings.tlUsers[0].level, 14);
  assert.equal(settings.tlUsers[0].party, "main2");
  assert.throws(() => validateMapping({ tlNames: "H1" }));
  assert.throws(() => validateMapping({ resNames: "A1,AZ501" }));
  assert.throws(() => mappingRange(validateMapping({ tlMules: "AZ1:AZ500" })), /too large/);
  assert.throws(() => validateMapping({ resLevel: 11 }));
});

test("CSV preserves empty rows, commas, quotes and multiline names", () => {
  assert.deepEqual(parseCsv('A,B\r\n,\r\n"A,B","C""D\nE"'), [["A", "B"], ["", ""], ["A,B", 'C"D\nE']]);
});
test("tab selection uses today, newest date, explicit date or GID and rejects ambiguous dates", () => {
  const sheets = [{name:"Guidelines",gid:"0"}, {name:"🍁 20/10/2026 Run",gid:"1"}, {name:"15/10/2026 Run",gid:"2"}];
  assert.equal(selectSheet(sheets,{today:"2026-10-20"}).gid,"1");
  assert.equal(selectSheet(sheets,{today:"2026-10-21"}).gid,"1");
  assert.equal(selectSheet(sheets,{date:"2026-10-15"}).gid,"2");
  assert.equal(selectSheet(sheets,{gid:"https://docs.google.com/example#gid=2"}).gid,"2");
  assert.throws(()=>selectSheet(sheets,{date:"2026-10-01"}));
  assert.throws(()=>selectSheet([...sheets,{name:"20/10/2026 Run 2",gid:"3"}],{today:"2026-10-20"}),/More than one/);
});
test("roster maps parties in priority order, extra TL, Sed Bishop and selected Bishop buyer", () => {
  const rows = Array.from({length:43},()=>[]);
  const put = (row,col,value)=>{ rows[row-5][col]=value; };
  put(10,0,"Bishop1"); put(20,0,"Bishop2"); put(20,6,"Sed Bishop");
  put(46,0,"Buyer1"); put(46,3,"Shad"); put(47,0,"Buyer2"); put(47,3,"Bish");
  put(6,0,"TL1"); put(6,3,"Buccaneer"); put(16,0,"TL2"); put(16,4,"Buccaneer"); put(26,0,"TL3"); put(26,3,"Buccaneer");
  const settings = parseRoster(rows,2);
  assert.equal(settings.buyerName,"Buyer2");
  assert.deepEqual(settings.resUsers.map(entry=>entry.sed),[false,true,undefined]);
  assert.equal(settings.resUsers[2].ownerBuyer,true);
  assert.equal(settings.resUsers[2].name,"Buyer2");
  assert.deepEqual(settings.tlUsers.map(entry=>[entry.name,entry.party,entry.main]),[["TL1","main1",true],["TL2","main2",true],["TL3","mules",false]]);
  assert.equal(parseRoster(rows,1).resUsers.length,2);
});
