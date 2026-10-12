import test from "node:test";
import assert from "node:assert/strict";
import {
  BODY_PARTS,
  DEATH_TIMER_ALERTS,
  MINUTE,
  SAFE_WINDOW,
  availableRes,
  buildEventLogText,
  castRes,
  castResTargets,
  castTl,
  createInitialState,
  crossedDeathTimerAlert,
  disconnectMember,
  formatDuration,
  getRecommendation,
  getPendingDeaths,
  getReviveGroups,
  getCycleSustainability,
  getServiceOutlook,
  recordMemberDeath,
  recordBuyerDeath,
  recordBuyerDisconnect,
  recordBodyPartDeath,
  recordRunnerDeath,
  recordRunnerDisconnect,
  recordOverrideTl,
  renameRunner,
  overrideRevive,
  resCooldown,
  setDeathGroup,
  updateSettingsPreservingRun,
  reviveMember,
  startRun,
  tlCooldown,
  undoLastEvent,
  withUndo,
} from "../src/engine.js";

const NOW = 1_800_000_000_000;

function activeState() {
  const started = startRun(createInitialState({
    buyerName: "Buyer",
    resNames: ["Bishop A", "Bishop B"],
    tlNames: ["Bucc A", "Bucc B"],
    tlLevels: [30, 14],
  }, NOW), NOW);
  return recordBuyerDeath(started, NOW);
}

test("TL cooldown is 50 minus level and Lv14 is the sustainable threshold", () => {
  assert.equal(tlCooldown(30), 20 * MINUTE);
  assert.equal(tlCooldown(14), 36 * MINUTE);
  assert.equal(tlCooldown(13), 37 * MINUTE);
});

test("Res cooldown uses its exact Lv1-Lv10 scale", () => {
  assert.equal(resCooldown(1), 57 * MINUTE);
  assert.equal(resCooldown(5), 45 * MINUTE);
  assert.equal(resCooldown(10), 30 * MINUTE);
});

test("both TL levels default to 30", () => {
  const state = createInitialState({}, NOW);
  assert.deepEqual(state.settings.tlLevels, [30, 30]);
  assert.deepEqual(state.run.tl.map((tl) => tl.level), [30, 30]);
});

test("exactly one main Res is the Sed Bishop and Main Party 1 is the default", () => {
  const defaults = createInitialState({}, NOW);
  assert.deepEqual(defaults.run.res.map((res) => [res.party, res.sed]), [["main1", true], ["main2", false]]);

  const normalized = createInitialState({
    resUsers: [
      { id: "resA", name: "A", main: true, party: "main1", sed: true },
      { id: "resB", name: "B", main: true, party: "main2", sed: true },
      { id: "resExtra", name: "Extra", main: false, party: "mules", sed: true },
    ],
  }, NOW);
  assert.deepEqual(normalized.run.res.map((res) => res.sed), [true, false, false]);
});

test("death timer alerts fire at every requested threshold", () => {
  assert.deepEqual(DEATH_TIMER_ALERTS.map((milliseconds) => milliseconds / 1_000), [540, 360, 240, 120, 60, 30, 20, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  DEATH_TIMER_ALERTS.forEach((threshold) => {
    assert.equal(crossedDeathTimerAlert(threshold + 1, threshold), threshold);
  });
  assert.equal(crossedDeathTimerAlert(45_000, 44_000), null);
});

test("body parts use the requested three-row display order", () => {
  assert.deepEqual(BODY_PARTS, ["Left Head", "Middle Head", "Right Head", "Left Arm", "Wings", "Right Arm", "Legs", "Tail"]);
});

test("starting a run only records the start; buyer death starts the safe window", () => {
  const started = startRun(createInitialState({}, NOW), NOW);
  assert.equal(started.run.buyerDeadlineAt, null);
  assert.equal(started.run.history[0].text, "Run started");
  assert.equal(getRecommendation(started, NOW).kind, "await-buyer-death");

  const state = recordBuyerDeath(started, NOW + 1);
  assert.equal(state.run.buyerDeadlineAt, NOW + 1 + SAFE_WINDOW);
  assert.equal(state.run.history[0].text, "Buyer died; timer started");
  assert.equal(getRecommendation(state, NOW + 1).kind, "wait-buyer");
});

test("an expired buyer window cannot still display as recoverable", () => {
  const state = activeState();
  assert.equal(getServiceOutlook(state, NOW + SAFE_WINDOW).text, "Window missed");
});

test("a buyer Res marks the buyer alive until their next recorded death", () => {
  let state = activeState();
  state = castRes(state, "resA", "buyer", NOW);

  assert.equal(state.run.buyerDeadlineAt, null);
  assert.equal(getRecommendation(state, NOW).kind, "await-buyer-death");

  state = recordBuyerDeath(state, NOW + 1_000);
  const recommendation = getRecommendation(state, NOW + 1_000);
  assert.equal(recommendation.kind, "wait-buyer");
  assert.equal(recommendation.actorId, "resB");
  assert.equal(recommendation.waitMs, SAFE_WINDOW);
});

test("a combined revive never delays a real revive merely to improve TL efficiency", () => {
  let state = activeState();
  state.run.tl[0].readyAt = NOW + 12 * MINUTE;
  state.run.tl[1].readyAt = NOW + 20 * MINUTE;
  state.run.buyerDeadlineAt = NOW + 5 * MINUTE;
  state = recordRunnerDeath(state, { name: "Runner", canCombine: true }, NOW);

  const recommendation = getRecommendation(state, NOW);
  assert.equal(recommendation.kind, "res-both");
  assert.equal(recommendation.waitMs, 5 * MINUTE);
});

test("a combined revive is immediate when the next TL is within nine minutes", () => {
  let state = activeState();
  state.run.tl[0].readyAt = NOW + 8 * MINUTE;
  state = recordRunnerDeath(state, { name: "Runner", canCombine: true }, NOW);
  assert.equal(getRecommendation(state, NOW).kind, "res-both");
});

test("a combined revive uses the actual safe deadline rather than an efficiency wait", () => {
  let state = activeState();
  state.run.tl[0].readyAt = NOW + 20 * MINUTE;
  state.run.tl[1].readyAt = NOW + 30 * MINUTE;
  state.run.buyerDeadlineAt = NOW + 5 * MINUTE;
  state = recordRunnerDeath(state, { name: "Runner", canCombine: true }, NOW);

  const recommendation = getRecommendation(state, NOW);
  assert.equal(recommendation.kind, "res-both");
  assert.equal(recommendation.waitMs, 5 * MINUTE);
});

test("two Res can spend one on a separate runner when TL is within buyer plus nine", () => {
  let state = activeState();
  state.run.buyerDeadlineAt = NOW + 4 * MINUTE;
  state.run.tl.forEach((tl, index) => { tl.readyAt = NOW + (index ? 15 : 12) * MINUTE; });
  state = recordRunnerDeath(state, { name: "Runner", canCombine: false }, NOW);
  assert.equal(getRecommendation(state, NOW).kind, "res-runner");
});

test("two Res are reserved for buyer when runner spend would break recoverable service", () => {
  let state = activeState();
  state.run.buyerDeadlineAt = NOW + 4 * MINUTE;
  state.run.tl.forEach((tl) => { tl.readyAt = NOW + 18 * MINUTE; });
  state = recordRunnerDeath(state, { name: "Runner", canCombine: false }, NOW);
  assert.equal(getRecommendation(state, NOW).kind, "save-res");
});

test("a separate runner may use a main Res when the simulator proves the buyer remains safe", () => {
  let state = activeState();
  state = castRes(state, "resA", "buyer", NOW);
  state = recordBuyerDeath(state, NOW);
  state.run.tl[0].readyAt = NOW + 5 * MINUTE;
  state.run.tl[1].readyAt = NOW + 15 * MINUTE;
  state = recordRunnerDeath(state, { name: "Runner", canCombine: false }, NOW);
  const recommendation = getRecommendation(state, NOW);
  assert.equal(recommendation.kind, "res-runner");
  assert.equal(recommendation.actorId, "resB");
});

test("one Res is saved when TL misses runner but remains within buyer coverage", () => {
  let state = activeState();
  state = castRes(state, "resA", "buyer", NOW);
  state = recordBuyerDeath(state, NOW);
  state.run.buyerDeadlineAt = NOW + 4 * MINUTE;
  state.run.tl.forEach((tl) => { tl.readyAt = NOW + 11 * MINUTE; });
  state = recordRunnerDeath(state, { name: "Runner", canCombine: false }, NOW);
  assert.equal(getRecommendation(state, NOW).kind, "save-res");
});

test("zero Res waits for TL when it precedes both deadlines", () => {
  let state = activeState();
  state = castRes(state, "resA", "buyer", NOW);
  state = castRes(state, "resB", "runner", NOW);
  state = recordBuyerDeath(state, NOW);
  state.run.tl[0].readyAt = NOW + 3 * MINUTE;
  state.run.tl[1].readyAt = NOW + 10 * MINUTE;
  state = recordRunnerDeath(state, { name: "Runner 2", canCombine: false }, NOW);
  assert.equal(getRecommendation(state, NOW).kind, "wait-separate");
});

test("casting TL starts its level-based cooldown and resets both Res", () => {
  let state = activeState();
  state = castRes(state, "resA", "buyer", NOW);
  state = castRes(state, "resB", "buyer", NOW);
  state = castTl(state, "tlB", NOW);
  assert.equal(state.run.tl[1].readyAt, NOW + 36 * MINUTE);
  assert.deepEqual(state.run.res.map((res) => res.readyAt), [NOW, NOW]);
});

test("TL resets every living connected Res but not a dead Res user", () => {
  let state = activeState();
  state = castRes(state, "resA", "buyer", NOW);
  state = castRes(state, "resB", "buyer", NOW);
  state = recordMemberDeath(state, "res", "resA", NOW + 1);
  state = castTl(state, "tlA", NOW + 2);
  assert.equal(state.run.res[0].readyAt, NOW + 30 * MINUTE);
  assert.equal(state.run.res[1].readyAt, NOW + 2);
  state = reviveMember(state, "res", "resA", NOW + 3);
  assert.equal(state.run.res[0].alive, true);
  assert.equal(state.run.res[0].readyAt, NOW + 30 * MINUTE);
});

test("the generalized planner distinguishes resource counts and TL levels", () => {
  const configured = (resCount, tlLevels) => createInitialState({
    resUsers: Array.from({ length: resCount }, (_, index) => ({ id: `r${index}`, name: `R${index}`, main: index < 2, party: index < 2 ? `main${index + 1}` : "mules" })),
    tlUsers: tlLevels.map((level, index) => ({ id: `t${index}`, name: `T${index}`, level, main: index < 2, party: index < 2 ? `main${index + 1}` : "mules" })),
  }, NOW);

  const fourRes = configured(4, [30, 30]);
  fourRes.run.tl.forEach((entry) => { entry.online = false; });
  assert.equal(getCycleSustainability(fourRes, NOW).sustainable, true);
  assert.equal(getCycleSustainability(configured(3, [14]), NOW).sustainable, false);
  assert.equal(getCycleSustainability(configured(3, [30]), NOW).sustainable, true);
  assert.equal(getCycleSustainability(configured(2, [14, 14]), NOW).sustainable, true);
  assert.equal(getCycleSustainability(configured(1, [30, 30, 30]), NOW).sustainable, true);
  assert.equal(getCycleSustainability(configured(1, [14, 14, 14]), NOW).sustainable, false);
});

test("main and extra TL are presented as interchangeable choices", () => {
  let state = startRun(createInitialState({
    resUsers: [{ id: "resA", name: "Bishop", main: true, party: "main1" }],
    tlUsers: [
      { id: "tlA", name: "Main Bucc", level: 30, main: true, party: "main1" },
      { id: "tlExtra", name: "TL Mule", level: 30, main: false, party: "mules" },
    ],
  }, NOW), NOW);
  state = castRes(state, "resA", "runner", NOW);
  state = recordBuyerDeath(state, NOW + 1);
  const recommendation = getRecommendation(state, NOW + 1);
  assert.equal(recommendation.title, "USE ANY READY TL NOW");
  assert.equal(recommendation.actorId, null);
  assert.match(recommendation.detail, /Main Bucc · TL Mule/);
});

test("a dead ready TL user can be revived to recover a broken buyer cycle", () => {
  let state = startRun(createInitialState({
    resUsers: [{ id: "resA", name: "Bishop", main: true, party: "main1" }],
    tlUsers: [
      { id: "tlA", name: "Bucc A", level: 30, main: true, party: "main1" },
      { id: "tlB", name: "Bucc B", level: 30, main: true, party: "main2" },
      { id: "tlC", name: "TL Mule", level: 30, main: false, party: "mules" },
    ],
  }, NOW), NOW);
  state = recordMemberDeath(state, "tl", "tlC", NOW + 1);
  state = recordBuyerDeath(state, NOW + 2);
  const recommendation = getRecommendation(state, NOW + 2);
  assert.equal(recommendation.kind, "revive-tl");
  assert.match(recommendation.title, /REVIVE TL MULE, THEN TL/);
  assert.match(recommendation.steps.at(-1), /Res buyer/);
});

test("expired timers clamp to zero unless a signed duration is requested", () => {
  assert.equal(formatDuration(-5 * MINUTE), "00:00");
  assert.equal(formatDuration(-5 * MINUTE, { signed: true }), "-05:00");
});

test("an offline Bishop is removed from available Res coverage", () => {
  let state = activeState();
  state = disconnectMember(state, "res", "resA", NOW);
  assert.deepEqual(availableRes(state, NOW).map((res) => res.id), ["resB"]);

  const unchanged = castRes(state, "resA", "buyer", NOW);
  assert.equal(unchanged.run.res[0].readyAt, NOW);
});

test("disconnecting one Buccaneer immediately marks the infinite buyer cycle as failed", () => {
  let state = activeState();
  state = disconnectMember(state, "tl", "tlA", NOW);
  const outlook = getServiceOutlook(state, NOW);
  assert.equal(outlook.sustainable, false);
  assert.equal(outlook.text, "Cycle broken");

  const recommendation = getRecommendation(state, NOW);
  assert.equal(recommendation.kind, "cycle-unsustainable");
  assert.equal(recommendation.title, "BUYER SERVICE WILL FAIL");
  assert.match(recommendation.detail, /2 Res \+ 1 TL/);
});

test("disconnecting one Bishop immediately marks the infinite buyer cycle as failed", () => {
  let state = activeState();
  state = disconnectMember(state, "res", "resB", NOW);
  assert.equal(getRecommendation(state, NOW).kind, "cycle-unsustainable");
});

test("buyer disconnect immediately ends the service and is logged", () => {
  let state = activeState();
  state = recordBuyerDisconnect(state, NOW + 1);
  assert.equal(state.run.buyerOnline, false);
  assert.equal(state.run.buyerDeadlineAt, null);
  assert.equal(state.run.history[0].text, "Buyer disconnected");
  assert.equal(getRecommendation(state, NOW + 1).kind, "buyer-disconnected");
  assert.equal(getServiceOutlook(state, NOW + 1).text, "Buyer DC");
});

test("runner disconnect logs immediately without matching or changing party members", () => {
  let state = activeState();
  state = recordBodyPartDeath(state, BODY_PARTS[0], NOW);
  state = recordBodyPartDeath(state, BODY_PARTS[1], NOW + 1);
  state = recordRunnerDisconnect(state, NOW + 2);

  assert.ok(state.run.res.every((member) => member.online));
  assert.ok(state.run.tl.every((member) => member.online));
  assert.equal(state.run.history[0].type, "runner-disconnect");
  assert.equal(state.run.history[0].text, "Runner disconnected");
});

test("event log export is plain text in chronological order", () => {
  let state = activeState();
  state = recordBodyPartDeath(state, "Left Head", NOW + 1);
  state = recordRunnerDeath(state, { canCombine: true }, NOW + 2);
  const deathEvent = state.run.history[0];
  state = recordRunnerDisconnect(state, NOW + 3);
  const disconnectEvent = state.run.history[0];

  const text = buildEventLogText(state, NOW + 4, (value) => String(value), {
    [deathEvent.id]: "FallenRunner",
    [disconnectEvent.id]: "NightRunner",
  });
  assert.match(text, /^AFK Service Helper - Event Log\r\nBuyer: Buyer\r\nExported: 1800000000004/);
  assert.ok(text.indexOf("Run started") < text.indexOf("Buyer died; timer started"));
  assert.ok(text.indexOf("Buyer died; timer started") < text.indexOf("Left Head defeated"));
  assert.match(text, /FallenRunner died; combined revive available/);
  assert.match(text, /NightRunner disconnected/);
  assert.equal(disconnectEvent.text, "Runner disconnected");
});

test("undo restores a disconnected member while absolute timers keep running", () => {
  let state = activeState();
  state = castRes(state, "resA", "buyer", NOW);
  const readyAt = state.run.res[0].readyAt;
  state = withUndo(state, disconnectMember(state, "res", "resA", NOW + 2 * MINUTE));
  assert.equal(state.run.res[0].online, false);

  state = undoLastEvent(state);
  assert.equal(state.run.res[0].online, true);
  assert.equal(state.run.res[0].readyAt, readyAt);
  assert.equal(formatDuration(readyAt - (NOW + 5 * MINUTE)), "25:00");
});

test("undo supports multiple actions without recursive snapshots", () => {
  let state = activeState();
  for (let index = 0; index < 12; index += 1) {
    state = withUndo(state, recordRunnerDisconnect(state, NOW + index));
  }

  assert.equal(state.run.undoStack.length, 12);
  assert.ok(state.run.undoStack.every((snapshot) => snapshot.run.undoStack.length === 0));
  assert.ok(state.run.history.every((event) => !event.snapshot));

  for (let index = 0; index < 12; index += 1) state = undoLastEvent(state);
  assert.equal(state.run.undoStack.length, 0);
  assert.equal(state.run.history.length, 2);
  assert.equal(state.run.history[0].text, "Buyer died; timer started");
  assert.equal(state.run.history[1].text, "Run started");
  assert.ok(JSON.stringify(state).length < 250_000);
});

test("multiple runner deaths coexist and exact Res revives only the selected group", () => {
  let state = activeState();
  state = recordRunnerDeath(state, { name: "Near", canCombine: true }, NOW + 1);
  state = recordRunnerDeath(state, { name: "Far", canCombine: false }, NOW + 2);
  assert.equal(state.run.runners.length, 2);
  assert.equal(getReviveGroups(state).length, 2);

  const buyerGroup = getReviveGroups(state).find((group) => group.id === "buyer");
  state = castResTargets(state, "resA", buyerGroup.targets, NOW + 3);
  assert.equal(state.run.buyerDeadlineAt, null);
  assert.deepEqual(getPendingDeaths(state).map((death) => death.name), ["Far"]);
});

test("unnamed runner deaths receive stable sequence labels", () => {
  let state = activeState();
  state = recordRunnerDeath(state, { canCombine: false }, NOW + 1);
  state = recordRunnerDeath(state, { canCombine: false }, NOW + 2);
  assert.deepEqual(state.run.runners.map((runner) => runner.name), ["Runner 1", "Runner 2"]);
});

test("renaming a runner updates pending groups, recommendations, and the linked log event", () => {
  let state = activeState();
  state = recordRunnerDeath(state, { canCombine: false }, NOW + 1);
  const runnerId = state.run.runners[0].id;
  state = renameRunner(state, runnerId, "NightRunner");

  assert.equal(state.run.runners[0].name, "NightRunner");
  assert.equal(state.run.runner.name, "NightRunner");
  assert.ok(getReviveGroups(state).some((group) => group.names.includes("NightRunner")));
  assert.match(getRecommendation(state, NOW + 1).title, /NIGHTRUNNER/);
  assert.equal(state.run.history[0].runnerName, "NightRunner");
  assert.match(buildEventLogText(state, NOW + 2, String), /NightRunner died/);
});

test("a Res cast on a dead Bishop revives that Bishop atomically", () => {
  let state = activeState();
  state = recordMemberDeath(state, "res", "resB", NOW + 1);
  const bishop = getPendingDeaths(state).find((death) => death.resourceId === "resB");
  state = castResTargets(state, "resA", [bishop.targetId], NOW + 2);
  assert.equal(state.run.res.find((entry) => entry.id === "resB").alive, true);
  assert.equal(state.run.res.find((entry) => entry.id === "resA").readyAt, NOW + 2 + 30 * MINUTE);
  assert.match(state.run.history[0].text, /Bishop B/);
});

test("pending deaths can be combined into one explicit revive group", () => {
  let state = activeState();
  state = recordMemberDeath(state, "tl", "tlA", NOW + 1);
  state = recordRunnerDeath(state, { name: "Runner", canCombine: false }, NOW + 2);
  const targets = getPendingDeaths(state).filter((death) => death.kind !== "buyer");
  state = setDeathGroup(state, targets[0].targetId, targets[1].groupId, NOW + 3);
  const combined = getReviveGroups(state).find((group) => group.names.includes("Bucc A") && group.names.includes("Runner"));
  state = castResTargets(state, "resA", combined.targets, NOW + 4);
  assert.equal(state.run.tl[0].alive, true);
  assert.equal(state.run.runners.length, 0);
});

test("external overrides correct Res and TL without rewinding unrelated timers", () => {
  let state = activeState();
  state = recordRunnerDeath(state, { name: "Far", canCombine: false }, NOW + 1);
  const runnerDeadline = state.run.runners[0].deadlineAt;
  state = castResTargets(state, null, ["buyer"], NOW + 2, { force: true, external: true });
  assert.equal(state.run.buyerDeadlineAt, null);
  assert.equal(state.run.runners[0].deadlineAt, runnerDeadline);
  assert.ok(state.run.res.every((entry) => entry.readyAt === NOW));

  state.run.res[0].readyAt = NOW + 30 * MINUTE;
  state = recordOverrideTl(state, null, NOW + 3);
  assert.equal(state.run.res[0].readyAt, NOW + 3);
  state = overrideRevive(state, [getPendingDeaths(state)[0].targetId], NOW + 4);
  assert.equal(state.run.runners.length, 0);
});

test("editing setup during a run preserves live timers and cooldowns", () => {
  let state = activeState();
  state = castRes(state, "resA", "buyer", NOW + 1);
  state = recordBuyerDeath(state, NOW + 2);
  const deadline = state.run.buyerDeadlineAt;
  const cooldown = state.run.res[0].readyAt;
  state = updateSettingsPreservingRun(state, {
    ...state.settings,
    buyerName: "Corrected Buyer",
    resUsers: state.settings.resUsers.map((entry) => entry.id === "resA" ? { ...entry, name: "Corrected Bishop" } : entry),
  }, NOW + 3);
  assert.equal(state.run.buyerDeadlineAt, deadline);
  assert.equal(state.run.res[0].readyAt, cooldown);
  assert.equal(state.run.res[0].name, "Corrected Bishop");
});
