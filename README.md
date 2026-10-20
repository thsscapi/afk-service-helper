# Sparrow's AFK Service Helper

A local, offline-capable AFK boss-service assistant that tracks any number of Resurrection and Time Leap providers, revive windows, deaths, disconnects, and event history.

## Run

Requires Node.js 18 or newer. No package installation is needed.

```powershell
npm start
```

Open <http://127.0.0.1:4173>.

## Google Sheets import

Party Setup → Import from Google Sheets → Save connection stores each user's own spreadsheet URL and cell mappings in their browser. There is no shared default spreadsheet. The optional Sparrow layout preset provides mappings only: buyer names H46/H47, buyer jobs K46/K47, main Bishop names H10/H20, Sed notes N10/N20, and TL job groups K5:K10, K15:L20, K26:K31 with names in H. Up to eight buyers can be configured using comma-separated cells; unused TL job ranges can be left empty.

Auto selects today's dated tab using the browser's local date, otherwise the newest dated tab (or the leftmost tab if no dates exist). Date and GID overrides are available. Duplicate dates require a GID to distinguish runs. Change connection edits the mappings; Forget connection removes them from that browser without changing the party roster.

The import reads names, Sed Bishop, and party assignments. It replaces the form's extra-provider list; skill levels use configurable defaults (initially Res 10 and TL 30). A Bishop buyer becomes a backup Res with Buyer character checked. Import does not change the sheet or apply setup until saved. Live setup saves preserve existing timers; reset between separate runs as usual.

The read-only `/api/sheet-import` endpoint accepts POST JSON containing `spreadsheet`, `mapping`, `buyer`, and optional `date` or `gid`. It rejects GET requests and missing spreadsheet settings. The server only fetches Google Sheets URLs with validated IDs; custom destinations are not accepted. Mappings are bounded to A1:AZ500 and 15,000 cells. Google Sheets must allow anyone with the link to view; private Google sign-in is not supported. No Google credentials or connections are stored by the application server. On import, the browser sends the configured link and mappings to the app server to read Google's public HTML tab list and CSV export; results use no-store. The endpoint works in both the local server and Vercel. Google export format changes may require updating the importer.

## Verify

```powershell
npm run check
```

## Rules encoded

- Buyer and runner safe windows are treated as 9 minutes.
- Starting a run records the start only; the dedicated Buyer died action begins each buyer revive window.
- Recording Res on the buyer marks them alive until the next Buyer died action.
- Buyer disconnects immediately end the service.
- Resurrection cooldown is 30 minutes.
- Time Leap cooldown is `50 - level` minutes.
- Party setup distinguishes main and extra providers, party assignments, and the Sed Bishop.
- Extra Resurrection is held as backup; main and extra Time Leap are interchangeable choices.
- Time Leap resets every tracked Resurrection whose user is living and connected.
- The planner simulates the configured resource mix and exact cooldowns instead of relying on a fixed skill count.
- Bishops are never asked to cast Resurrection solely to improve efficiency.
- Separate runner revives are recommended only when the simulated buyer cycle remains recoverable.
- Dead skill users can be revived; disconnected skill users remain unavailable for the rest of the run.
- Horntail's eight main-body parts can be marked dead on an image overlay.
- Runner death and disconnect IGNs can be entered directly in Recent events and are included in exported logs.
- Up to 30 actions can be undone without changing the absolute timer deadlines.
- All live state is stored in the browser only.
