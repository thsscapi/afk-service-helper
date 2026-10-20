import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseRoster, selectSheet } from "../src/sheet-import.js";

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
