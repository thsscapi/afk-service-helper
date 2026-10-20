# Sparrow's AFK Service Helper

A local, offline-capable AFK boss-service assistant that tracks any number of Resurrection and Time Leap providers, revive windows, deaths, disconnects, and event history.

## Run

Requires Node.js 18 or newer. No package installation is needed.

```powershell
npm start
```

Open <http://127.0.0.1:4173>.

## Google Sheets import

Party Setup → Fill from sheet imports the configured Autumn Horntail spreadsheet for review before Save setup. Auto selects today's dated tab in Asia/Singapore, otherwise the newest dated tab (or the leftmost tab if no dates exist). Date and GID overrides are available. Duplicate dates require a GID to distinguish runs. Buyer 1 reads H46/K46; Buyer 2 reads H47/K47.

The import reads names, Sed Bishop, and party assignments. It replaces the form's extra-provider list; Res levels default to 10 and TL levels to 30 for review. A Bishop buyer becomes a backup Res with Buyer character checked. Import does not change the sheet or apply setup until saved. Live setup saves preserve existing timers; reset between separate runs as usual.

The read-only `/api/sheet-import` endpoint uses Google's public HTML tab list and CSV export, so the workbook must remain accessible to link viewers. No Google credentials are stored. The endpoint is supported both by the local server and a Vercel Node function. Google export format changes may require updating the importer.

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
