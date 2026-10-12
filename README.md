# Sparrow's AFK Service Helper

A local, offline-capable AFK boss-service assistant that tracks any number of Resurrection and Time Leap providers, revive windows, deaths, disconnects, and event history.

## Run

Requires Node.js 18 or newer. No package installation is needed.

```powershell
npm start
```

Open <http://127.0.0.1:4173>.

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
