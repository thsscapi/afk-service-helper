import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("hover styles never move buttons", () => {
  const hoverRules = [...styles.matchAll(/[^{}]*:hover[^{}]*\{([^{}]*)\}/g)].map((match) => match[1]);
  assert.ok(hoverRules.length > 0);
  hoverRules.forEach((rule) => assert.doesNotMatch(rule, /\btransform\s*:/));
});

test("the UI has no reconnect action and exposes undo and export", () => {
  assert.doesNotMatch(`${app}\n${html}`, /reconnect/i);
  assert.match(html, /id="undo-button"/);
  assert.match(html, /id="export-button"/);
});

test("runner disconnect IGN exists only in the event log and timer ticks avoid full card rebuilds", () => {
  assert.doesNotMatch(html, /id="disconnect-runner-ign"/);
  assert.doesNotMatch(html, /id="runner-ign"/);
  assert.match(app, /class="history-runner-ign"/);
  assert.match(app, /querySelectorAll\("\.history-runner-ign"\)/);
  assert.match(app, /event\.type === "runner" && \/\\bdied/);
  assert.match(app, /setInterval\(\(\) => render\(\{ rebuild: false \}\), 250\)/);
});

test("the run dashboard uses compact labels, requested icons, and tooltip copy", () => {
  assert.doesNotMatch(html, /Horntail operations|Party resources|Cooldown board|Incident controls|One-tap runner events|Horntail progress|>Body parts</i);
  assert.match(html, /https:\/\/legends\.ml\/static\/images\/lib\/item\/04031138\.png/);
  assert.match(html, /class="role-icon sword-icon"[^>]*>⚔️</);
  assert.match(html, />Runner died:</);
  assert.match(html, />Near buyer</);
  assert.match(html, />Far from buyer</);
  assert.match(html, />Horntail body status</);
  assert.match(app, /down \? "Dead" : "Alive"/);
  assert.match(html, /id="next-detail"/);
  assert.match(html, /id="next-steps"/);
  assert.match(app, /actionLabel\.textContent = "Used Res on"/);
  assert.match(app, /ready \? "READY" : formatDuration\(resource\.readyAt - now\)/);
  assert.doesNotMatch(html, /Resurrection has a 30-minute cooldown/);
  assert.doesNotMatch(app, /Record skill use/);
  assert.match(app, /castButton\.textContent = "Used TL"/);
  assert.match(app, /connectionButton\.textContent = "DC"/);
  assert.match(html, /src="\/assets\/resurrection\.png"/);
  assert.match(html, /src="\/assets\/time-leap\.png"/);
  assert.match(styles, /background: url\("\/assets\/horntail\.png"\)/);
  assert.match(app, /button\.dataset\.bodyPart/);
});

test("portrait layouts keep Recent events in a sticky right rail", () => {
  assert.match(styles, /@media \(max-width: 980px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\) clamp\(190px, 28vw, 240px\)/);
  assert.match(styles, /@media \(max-width: 470px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 142px/);
  assert.doesNotMatch(styles, /\.history-section\s*\{[^}]*position:\s*static/);
});

test("events are grouped near the timers and keyboard undo stays out of text fields", () => {
  assert.doesNotMatch(html, /class="incident-section"|>Events<\/h2>/);
  const buyerCard = html.match(/<article class="status-card buyer-card">[\s\S]*?<\/article>/)?.[0] || "";
  const runnerCard = html.match(/<article class="status-card runner-card">[\s\S]*?<\/article>/)?.[0] || "";
  assert.match(buyerCard, /id="buyer-died-button"[\s\S]*?id="buyer-disconnected-button"/);
  assert.match(runnerCard, /id="runner-together-button"[\s\S]*?id="runner-separate-button"[\s\S]*?id="runner-disconnected-button"/);
  assert.doesNotMatch(app, /Run status/);
  assert.match(html, /id="undo-button"[^>]*data-step-badge="11"[^>]*aria-keyshortcuts="Control\+Z Meta\+Z"[^>]*>↶ Undo<\/button>/);
  assert.match(app, /document\.addEventListener\("keydown"/);
  assert.match(app, /target instanceof HTMLInputElement/);
});

test("branding, instructions, larger timers, body accordion, and shared footer are present", () => {
  assert.match(html, /<title>Sparrow's AFK Service Helper<\/title>/);
  assert.match(html, /<link rel="icon" type="image\/png" href="\/assets\/resurrection\.png" \/>/);
  assert.match(html, /<h1>Sparrow's AFK Service <span>Helper<\/span><\/h1>/);
  assert.match(html, /class="app-description"[^>]*>A fan-made tool for managing AFK buyer services/);
  assert.match(html, /<details class="app-instructions">\s*<summary><span class="instructions-summary-icon"[^>]*>ⓘ<\/span><span>See instructions<\/span><\/summary>/);
  assert.doesNotMatch(html, /<details class="app-instructions" open/);
  assert.match(html, /Setup Party:/);
  assert.match(html, /Start Run:/);
  assert.match(html, /Buyer Death:/);
  assert.match(html, /Follow the <button[^>]*>Next Action<\/button>/);
  assert.match(html, /Revive:/);
  assert.match(html, /Time Leap:/);
  assert.match(html, /Deaths\/DC:/);
  assert.match(html, /Body Part Dies \(optional\):/);
  assert.match(html, /Export Log:/);
  assert.match(html, /Undo a mistake:/);
  assert.equal((html.match(/class="instruction-link"/g) || []).length, 11);
  assert.match(styles, /\.instructions-list \{[^}]*grid-template-columns: repeat\(2[^}]*grid-template-rows: repeat\(6[^}]*grid-auto-flow: column/);
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.instructions-list \{[^}]*grid-template-columns: 1fr[^}]*grid-auto-flow: row/);
  assert.match(html, /id="settings-button"[^>]*data-step-badge="1"/);
  assert.match(html, /id="start-button"[^>]*data-step-badge="2"/);
  assert.match(html, /id="export-button"[^>]*data-step-badge="9"/);
  assert.match(html, /id="override-button"[^>]*data-step-badge="10"/);
  assert.match(html, /id="undo-button"[^>]*data-step-badge="11"/);
  [3, 4, 5, 6, 7, 8].forEach((step) => assert.match(html, new RegExp(`class="step-badge"[^>]*>${step}<`)));
  assert.match(app, /function flashInstructionTargets\(selector\)/);
  assert.match(app, /instruction-target-flash/);
  assert.match(app, /document\.body\.classList\.toggle\("instructions-open", elements\.instructions\.open\)/);
  assert.match(app, /elements\.instructions\.addEventListener\("toggle", renderInstructionsState\)/);
  assert.match(styles, /body:not\(\.instructions-open\) \.step-badge,[\s\S]*?body:not\(\.instructions-open\) \.step-badged::before \{ display: none; \}/);
  assert.match(styles, /\.group-title > span \{[^}]*display: flex/);
  assert.doesNotMatch(styles, /\.group-title span \{[^}]*display: flex/);
  assert.match(styles, /\.timer \{[^}]*height: 100%[^}]*font-size: clamp\(1\.65rem/);
  assert.match(html, /id="body-parts-toggle"[^>]*aria-expanded="true"[^>]*aria-controls="body-part-buttons"/);
  assert.match(app, /BODY_PARTS_COLLAPSED_KEY/);
  assert.match(app, /bodyPartsToggle\.setAttribute\("aria-expanded"/);
  assert.match(html, /https:\/\/orbis-pq-helper\.vercel\.app\//);
  assert.match(html, /https:\/\/pf-navigator\.vercel\.app\//);
  assert.match(html, /https:\/\/ko-fi\.com\/thsscapi/);
  assert.match(html, /Made with love for/);
});

test("party setup, runner, and failure status labels are explicit", () => {
  assert.match(html, />Party Setup<\/span>/);
  assert.match(html, /<p>Runner<\/p><h3 id="runner-name">None dead<\/h3>/);
  assert.match(app, /willFail \? "Will fail" : "Protected"/);
  assert.match(app, /groupId === "buyer"\) \? "Near buyer" : "Far from buyer"/);
  assert.match(app, /state\.run\.undoStack\?\.length/);
});

test("Reset is in the header and resource action rows reserve equal space", () => {
  assert.ok(html.indexOf('id="reset-button"') < html.indexOf('id="settings-button"'));
  assert.doesNotMatch(html, /class="incident-section"/);
  assert.match(styles, /\.resource-card \{ display: grid;[^}]*grid-template-rows: auto 1fr auto/);
  assert.match(styles, /\.resource-action-label \{[^}]*min-height:/);
  assert.match(app, /actionLabel\.setAttribute\("aria-hidden", "true"\)/);
});

test("buyer and runner event buttons use primary and separate DC rows", () => {
  const buyerCard = html.match(/<article class="status-card buyer-card">[\s\S]*?<\/article>/)?.[0] || "";
  const runnerCard = html.match(/<article class="status-card runner-card">[\s\S]*?<\/article>/)?.[0] || "";
  assert.match(buyerCard, /class="status-primary-row"[\s\S]*?id="buyer-died-button"[\s\S]*?class="status-connection-row"[\s\S]*?id="buyer-disconnected-button"/);
  assert.match(runnerCard, /class="status-primary-row"[\s\S]*?id="runner-together-button"[\s\S]*?id="runner-separate-button"[\s\S]*?class="status-connection-row"[\s\S]*?id="runner-disconnected-button"/);
  assert.match(styles, /\.status-action-button \{[^}]*min-height: 38px[^}]*font-size: 0\.78rem/);
  assert.match(styles, /\.connection-button, \.status-connection-row \.dc-action \{[^}]*min-width: 44px[^}]*min-height: 0[^}]*font-size: 0\.68rem/);
});

test("party setup supports extra providers, parties, Sed Bishop, and skill-user incidents", () => {
  assert.match(html, /id="add-extra-res"/);
  assert.match(html, /id="add-extra-tl"/);
  assert.match(html, /name="resASed"/);
  assert.match(html, /name="resAParty"/);
  assert.match(html, /name="tlAParty"/);
  assert.match(app, /PARTY_OPTIONS/);
  assert.match(app, /function extraProviderRow\(type, provider = \{\}\)/);
  assert.match(app, /recordMemberDeath/);
  assert.match(app, /reviveMember/);
  assert.match(app, /memberStateButton\.textContent|setText\(memberStateButton, alive \? "Died" : "Revived"\)/);
  assert.doesNotMatch(app, /class="provider-sed"/);
  assert.match(app, /event\.target\.name === "resASed" \? "resBSed" : "resASed"/);
  assert.match(styles, /\.remove-provider::before \{ content: "×"/);
  assert.match(styles, /\.resource-card\.backup/);
  assert.match(styles, /\.resource-card\.sed/);
});

test("party selects inset their arrows and Next Action keeps its instruction flash", () => {
  assert.match(styles, /\.modal select \{[^}]*padding-right: 36px[^}]*background-position: right 12px center/);
  assert.doesNotMatch(app, /elements\.nextCard\.className\s*=/);
  assert.match(app, /elements\.nextCard\.classList\.toggle\(className, className === toneClass\)/);
});

test("exact pending deaths and missed-action overrides are exposed", () => {
  assert.match(html, /id="pending-deaths"/);
  assert.match(html, /id="override-button"/);
  assert.match(html, /id="override-dialog"/);
  assert.match(html, /id="override-res-caster"/);
  assert.match(app, /castResTargets/);
  assert.match(app, /recordOverrideTl/);
  assert.match(app, /updateSettingsPreservingRun/);
  assert.match(app, /group\.names\.join\(" \+ "\)/);
  assert.match(html, /name="resALevel"[^>]*max="10"/);
  assert.match(app, /provider-owner-buyer/);
});

test("revive groups use one-click radios, numbered runners, and matching colours", () => {
  assert.doesNotMatch(app, /Current group/);
  assert.doesNotMatch(app, /class="pending-group">/);
  assert.match(app, /input\.type = "radio"/);
  assert.match(app, /group-color-/);
  assert.match(styles, /\.pending-group-chip input:checked \+ span/);
  assert.match(styles, /\.resource-button\.cast-choice\[class\*="group-color-"\]/);
  assert.match(html, /data-flash-target="#pending-deaths, #res-cards"/);
});

test("runner names are editable live and prefill the still-editable event-log field", () => {
  assert.match(app, /className = "pending-name-input"/);
  assert.match(app, /commit\(renameRunner\(state, death\.targetId, value\)\)/);
  assert.match(app, /input\.dataset\.syncedName !== syncedName/);
  assert.match(app, /input\.value = syncedName/);
  assert.match(app, /class="history-runner-ign"/);
  assert.match(styles, /\.pending-name-input:focus/);
});
