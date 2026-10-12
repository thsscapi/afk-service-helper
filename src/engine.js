export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const SAFE_WINDOW = 9 * MINUTE;
export const RES_COOLDOWN = 30 * MINUTE;
export const PARTY_OPTIONS = [
  { id: "main1", label: "Main Party 1" },
  { id: "main2", label: "Main Party 2" },
  { id: "mules", label: "Buyer / Mule Party" },
];
const UNDO_LIMIT = 30;
const PLANNER_CYCLES = 32;
export const DEATH_TIMER_ALERTS = [9 * MINUTE, 6 * MINUTE, 4 * MINUTE, 2 * MINUTE, MINUTE, 30 * SECOND, 20 * SECOND, 10 * SECOND, 9 * SECOND, 8 * SECOND, 7 * SECOND, 6 * SECOND, 5 * SECOND, 4 * SECOND, 3 * SECOND, 2 * SECOND, SECOND];
export const BODY_PARTS = ["Left Head", "Middle Head", "Right Head", "Left Arm", "Wings", "Right Arm", "Legs", "Tail"];

export function crossedDeathTimerAlert(previousRemaining, currentRemaining) {
  if (!Number.isFinite(previousRemaining) || !Number.isFinite(currentRemaining)) return null;
  return DEATH_TIMER_ALERTS.find((threshold) => previousRemaining > threshold && currentRemaining <= threshold) ?? null;
}

export function tlCooldown(level) {
  const safeLevel = Math.max(1, Math.min(30, Number(level) || 1));
  return (50 - safeLevel) * MINUTE;
}

export function resCooldown(level) {
  const safeLevel = Math.max(1, Math.min(10, Number(level) || 10));
  return (60 - 3 * safeLevel) * MINUTE;
}

export function createInitialState(settings = {}, now = Date.now()) {
  const normalized = normalizeSettings(settings);

  return {
    version: 2,
    settings: normalized,
    run: {
      active: false,
      startedAt: null,
      buyerDeadlineAt: null,
      buyerOnline: true,
      runner: null,
      runners: [],
      nextRunnerNumber: 1,
      bodyParts: Object.fromEntries(BODY_PARTS.map((part) => [part, false])),
      serviceFailed: false,
      lastResTarget: null,
      nextResId: normalized.resUsers[0]?.id || null,
      nextTlId: normalized.tlUsers[0]?.id || null,
      undoStack: [],
      res: normalized.resUsers.map((provider) => runtimeProvider(provider, now)),
      tl: normalized.tlUsers.map((provider) => runtimeProvider(provider, now)),
      history: [],
    },
  };
}

export function migrateState(state, now = Date.now()) {
  if (!state?.run || !state?.settings) return createInitialState({}, now);
  const next = clone(state);
  next.version = 2;
  next.settings = normalizeSettings(next.settings);
  next.run.res = mergeRuntimeProviders(next.settings.resUsers, next.run.res, now);
  next.run.tl = mergeRuntimeProviders(next.settings.tlUsers, next.run.tl, now);
  next.run.nextResId = next.run.res.some((entry) => entry.id === next.run.nextResId) ? next.run.nextResId : next.run.res[0]?.id || null;
  next.run.nextTlId = next.run.tl.some((entry) => entry.id === next.run.nextTlId) ? next.run.nextTlId : next.run.tl[0]?.id || null;
  next.run.buyerOnline ??= true;
  if (!Array.isArray(next.run.runners)) {
    next.run.runners = next.run.runner ? [{ ...next.run.runner, id: `runner-${next.run.runner.deadlineAt || now}`, groupId: next.run.runner.canCombine ? "buyer" : `runner-${next.run.runner.deadlineAt || now}` }] : [];
  }
  syncLegacyRunner(next);
  next.run.nextRunnerNumber = Math.max(1, Number(next.run.nextRunnerNumber) || next.run.runners.length + 1);
  next.run.undoStack ||= [];
  return next;
}

function normalizeSettings(settings) {
  const legacyResNames = settings.resNames || ["Bishop A", "Bishop B"];
  const legacyTlNames = settings.tlNames || ["Bucc A", "Bucc B"];
  const legacyTlLevels = settings.tlLevels || [30, 30];
  const defaultRes = [
    { id: "resA", name: legacyResNames[0] || "Bishop A", level: 10, main: true, party: "main1", sed: true },
    { id: "resB", name: legacyResNames[1] || "Bishop B", level: 10, main: true, party: "main2", sed: false },
  ];
  const defaultTl = [
    { id: "tlA", name: legacyTlNames[0] || "Bucc A", level: legacyTlLevels[0], main: true, party: "main1" },
    { id: "tlB", name: legacyTlNames[1] || "Bucc B", level: legacyTlLevels[1], main: true, party: "main2" },
  ];
  const resUsers = normalizeProviders(settings.resUsers?.length ? settings.resUsers : defaultRes, "res");
  let sedAssigned = false;
  resUsers.forEach((provider) => {
    provider.sed = provider.main && provider.sed && !sedAssigned;
    if (provider.sed) sedAssigned = true;
  });
  if (!sedAssigned) {
    const firstMainRes = resUsers.find((provider) => provider.main);
    if (firstMainRes) firstMainRes.sed = true;
  }
  const tlUsers = normalizeProviders(settings.tlUsers?.length ? settings.tlUsers : defaultTl, "tl");
  return {
    buyerName: String(settings.buyerName || "Buyer").trim() || "Buyer",
    resNames: resUsers.filter((entry) => entry.main).slice(0, 2).map((entry) => entry.name),
    tlNames: tlUsers.filter((entry) => entry.main).slice(0, 2).map((entry) => entry.name),
    tlLevels: tlUsers.filter((entry) => entry.main).slice(0, 2).map((entry) => entry.level),
    resUsers,
    tlUsers,
  };
}

function normalizeProviders(providers, type) {
  const usedIds = new Set();
  return providers.map((provider, index) => {
    const fallbackId = `${type}${index < 2 ? String.fromCharCode(65 + index) : `Extra${index - 1}`}`;
    let id = String(provider.id || fallbackId).replace(/[^a-zA-Z0-9_-]/g, "") || fallbackId;
    while (usedIds.has(id)) id = `${id}-${index + 1}`;
    usedIds.add(id);
    const main = provider.main ?? index < 2;
    return {
      id,
      name: String(provider.name || `${type === "res" ? "Bishop" : "Bucc"} ${index + 1}`).trim(),
      main: Boolean(main),
      backup: type === "res" && !main,
      party: PARTY_OPTIONS.some((party) => party.id === provider.party) ? provider.party : main ? (index === 0 ? "main1" : "main2") : "mules",
      sed: type === "res" && main && Boolean(provider.sed),
      ownerBuyer: !main && Boolean(provider.ownerBuyer),
      level: type === "tl"
        ? Math.max(1, Math.min(30, Number(provider.level) || 1))
        : Math.max(1, Math.min(10, Number(provider.level) || 10)),
    };
  });
}

function runtimeProvider(provider, now) {
  return { ...provider, readyAt: now, lastUsedAt: null, online: true, alive: true, deadDeadlineAt: null, reviveGroupId: null };
}

function mergeRuntimeProviders(configured, saved = [], now) {
  return configured.map((provider) => {
    const previous = saved.find((entry) => entry.id === provider.id);
    return {
      ...provider,
      readyAt: Number.isFinite(previous?.readyAt) ? previous.readyAt : now,
      lastUsedAt: previous?.lastUsedAt ?? null,
      online: previous?.online !== false,
      alive: previous?.alive !== false,
      deadDeadlineAt: Number.isFinite(previous?.deadDeadlineAt) ? previous.deadDeadlineAt : null,
      reviveGroupId: previous?.reviveGroupId || null,
    };
  });
}

function syncLegacyRunner(state) {
  state.run.runners ||= [];
  const first = [...state.run.runners].sort((a, b) => a.deadlineAt - b.deadlineAt)[0] || null;
  state.run.runner = first ? { ...first, canCombine: first.groupId === "buyer" } : null;
}

export function partyLabel(partyId) {
  return PARTY_OPTIONS.find((party) => party.id === partyId)?.label || "Unassigned";
}

export function startRun(state, now = Date.now()) {
  const fresh = createInitialState(state.settings, now);
  fresh.run.active = true;
  fresh.run.startedAt = now;
  fresh.run.buyerDeadlineAt = null;
  fresh.run.history = [historyEvent(now, "run", "Run started")];
  return fresh;
}

export function recordBuyerDeath(state, now = Date.now()) {
  if (!state.run.active || state.run.buyerOnline === false || Number.isFinite(state.run.buyerDeadlineAt)) return state;
  const next = clone(state);
  next.run.buyerDeadlineAt = now + SAFE_WINDOW;
  [...next.run.res, ...next.run.tl].filter((entry) => entry.ownerBuyer && entry.online !== false).forEach((entry) => {
    entry.alive = false;
    entry.deadDeadlineAt = next.run.buyerDeadlineAt;
    entry.reviveGroupId = "buyer";
  });
  next.run.history.unshift(historyEvent(now, "buyer", "Buyer died; timer started"));
  return next;
}

export function recordBuyerDisconnect(state, now = Date.now()) {
  if (!state.run.active || state.run.buyerOnline === false) return state;
  const next = clone(state);
  next.run.buyerOnline = false;
  next.run.buyerDeadlineAt = null;
  next.run.serviceFailed = true;
  [...next.run.res, ...next.run.tl].filter((entry) => entry.ownerBuyer).forEach((entry) => {
    entry.online = false;
    entry.deadDeadlineAt = null;
    entry.reviveGroupId = null;
  });
  next.run.history.unshift(historyEvent(now, "buyer-disconnect", "Buyer disconnected"));
  return next;
}

export function recordRunnerDeath(state, { name = "", canCombine = false } = {}, now = Date.now()) {
  const next = clone(state);
  next.run.runners ||= [];
  next.run.nextRunnerNumber = Math.max(1, Number(next.run.nextRunnerNumber) || 1);
  const id = `runner-${now}-${Math.random().toString(36).slice(2, 7)}`;
  const suppliedName = name.trim();
  const runnerName = suppliedName || `Runner ${next.run.nextRunnerNumber++}`;
  const runner = { id, name: runnerName, deadlineAt: now + SAFE_WINDOW, canCombine, groupId: canCombine ? "buyer" : `solo:runner:${id}` };
  next.run.runners.push(runner);
  syncLegacyRunner(next);
  const event = historyEvent(now, "runner", `${runner.name} died${canCombine ? "; combined revive available" : ""}`);
  event.runnerId = runner.id;
  event.runnerName = runner.name;
  next.run.history.unshift(event);
  return next;
}

export function renameRunner(state, runnerId, name) {
  const nextName = String(name || "").trim();
  if (!nextName) return state;
  const next = clone(state);
  const runner = (next.run.runners || []).find((entry) => entry.id === runnerId || `runner:${entry.id}` === runnerId);
  if (!runner || runner.name === nextName) return state;
  const previousName = runner.name;
  runner.name = nextName;
  const event = (next.run.history || []).find((entry) => entry.runnerId === runner.id)
    || (next.run.history || []).find((entry) => entry.type === "runner" && entry.text.startsWith(`${previousName} died`));
  if (event) {
    const suffixAt = event.text.search(/\sdied(?:;|$)/i);
    event.text = suffixAt >= 0 ? `${nextName}${event.text.slice(suffixAt)}` : `${nextName} died`;
    event.runnerId = runner.id;
    event.runnerName = nextName;
  }
  syncLegacyRunner(next);
  return next;
}

export function recordRunnerDisconnect(state, now = Date.now()) {
  const next = clone(state);
  next.run.history.unshift(historyEvent(now, "runner-disconnect", "Runner disconnected"));
  return next;
}

export function recordBodyPartDeath(state, bodyPart, now = Date.now()) {
  if (!BODY_PARTS.includes(bodyPart)) return state;
  const next = clone(state);
  next.run.bodyParts ||= Object.fromEntries(BODY_PARTS.map((part) => [part, false]));
  if (next.run.bodyParts[bodyPart]) return state;
  next.run.bodyParts[bodyPart] = true;
  const defeated = BODY_PARTS.filter((part) => next.run.bodyParts[part]).length;
  next.run.history.unshift(historyEvent(now, "body-part", `${bodyPart} defeated · ${defeated}/8 parts down`));
  return next;
}

export function disconnectMember(state, resourceType, resourceId, now = Date.now()) {
  const next = clone(state);
  const collection = resourceType === "tl" ? next.run.tl : next.run.res;
  const member = collection.find((entry) => entry.id === resourceId);
  if (!member || member.online === false) return state;
  member.online = false;
  member.deadDeadlineAt = null;
  member.reviveGroupId = null;
  next.run.history.unshift(historyEvent(now, "disconnect", `${member.name} disconnected; party skill unavailable`));
  return next;
}

export function disconnectPendingTarget(state, targetId, now = Date.now()) {
  if (targetId === "buyer") return recordBuyerDisconnect(state, now);
  if (targetId.startsWith("resource:")) {
    const [, type, id] = targetId.split(":");
    return disconnectMember(state, type, id, now);
  }
  if (!targetId.startsWith("runner:")) return state;
  const next = clone(state);
  const runner = (next.run.runners || []).find((entry) => `runner:${entry.id}` === targetId);
  if (!runner) return state;
  next.run.runners = next.run.runners.filter((entry) => entry.id !== runner.id);
  syncLegacyRunner(next);
  next.run.history.unshift(historyEvent(now, "runner-disconnect", `${runner.name} disconnected`));
  return next;
}

export function recordMemberDeath(state, resourceType, resourceId, now = Date.now()) {
  const original = state.run[resourceType === "tl" ? "tl" : "res"]?.find((entry) => entry.id === resourceId);
  if (original?.ownerBuyer) return recordBuyerDeath(state, now);
  const next = clone(state);
  const collection = resourceType === "tl" ? next.run.tl : next.run.res;
  const member = collection.find((entry) => entry.id === resourceId);
  if (!member || member.online === false || member.alive === false) return state;
  member.alive = false;
  member.deadDeadlineAt = now + SAFE_WINDOW;
  member.reviveGroupId = `resource:${resourceType}:${resourceId}`;
  next.run.history.unshift(historyEvent(now, "member-death", `${member.name} died; ${resourceType === "tl" ? "TL" : "Res"} unavailable`));
  return next;
}

export function reviveMember(state, resourceType, resourceId, now = Date.now()) {
  const next = clone(state);
  const collection = resourceType === "tl" ? next.run.tl : next.run.res;
  const member = collection.find((entry) => entry.id === resourceId);
  if (!member || member.online === false || member.alive !== false) return state;
  member.alive = true;
  member.deadDeadlineAt = null;
  member.reviveGroupId = null;
  next.run.history.unshift(historyEvent(now, "member-revive", `${member.name} revived; ${resourceType === "tl" ? "TL" : "Res"} available again`));
  return next;
}

export function castRes(state, resId, target, now = Date.now()) {
  const validTarget = ["buyer", "runner", "both"].includes(target) ? target : "buyer";
  const runnerTarget = getPendingDeaths(state).find((entry) => entry.kind !== "buyer" && !entry.ownerBuyer);
  const targetIds = validTarget === "buyer" ? ["buyer"]
    : validTarget === "runner" ? (runnerTarget ? getGroupTargetIds(state, runnerTarget.groupId) : [])
      : [...getGroupTargetIds(state, "buyer"), ...(runnerTarget && runnerTarget.groupId !== "buyer" ? getGroupTargetIds(state, runnerTarget.groupId) : [])];
  if (targetIds.length) return castResTargets(state, resId, targetIds, now);
  const next = clone(state);
  const res = next.run.res.find((entry) => entry.id === resId);
  if (!res || !isUsable(res) || res.readyAt > now) return state;
  res.readyAt = now + resCooldown(res.level);
  res.lastUsedAt = now;
  next.run.history.unshift(historyEvent(now, "res", `${res.name} used Res on ${validTarget}`));
  return next;
}

export function getPendingDeaths(state) {
  const deaths = [];
  if (state.run.buyerOnline !== false && Number.isFinite(state.run.buyerDeadlineAt)) {
    deaths.push({ targetId: "buyer", name: state.settings.buyerName, kind: "buyer", deadlineAt: state.run.buyerDeadlineAt, groupId: "buyer" });
  }
  for (const type of ["res", "tl"]) {
    for (const member of state.run[type] || []) {
      if (member.online === false || member.alive !== false || !Number.isFinite(member.deadDeadlineAt) || member.ownerBuyer) continue;
      deaths.push({ targetId: `resource:${type}:${member.id}`, name: member.name, kind: "resource", resourceType: type, resourceId: member.id, deadlineAt: member.deadDeadlineAt, groupId: member.reviveGroupId || `resource:${type}:${member.id}` });
    }
  }
  for (const runner of state.run.runners || []) {
    deaths.push({ targetId: `runner:${runner.id}`, name: runner.name, kind: "runner", deadlineAt: runner.deadlineAt, groupId: runner.groupId || (runner.canCombine ? "buyer" : runner.id) });
  }
  return deaths.sort((a, b) => a.deadlineAt - b.deadlineAt);
}

export function getReviveGroups(state) {
  const groups = new Map();
  for (const death of getPendingDeaths(state)) {
    const group = groups.get(death.groupId) || { id: death.groupId, targets: [], names: [], deadlineAt: death.deadlineAt, hasBuyer: false };
    group.targets.push(death.targetId);
    group.names.push(death.name);
    group.deadlineAt = Math.min(group.deadlineAt, death.deadlineAt);
    group.hasBuyer ||= death.kind === "buyer";
    groups.set(death.groupId, group);
  }
  return [...groups.values()].sort((a, b) => a.deadlineAt - b.deadlineAt);
}

function getGroupTargetIds(state, groupId) {
  return getPendingDeaths(state).filter((entry) => entry.groupId === groupId).map((entry) => entry.targetId);
}

export function setDeathGroup(state, targetId, groupId, now = Date.now()) {
  const next = clone(state);
  const validGroup = groupId === "__separate__" ? `solo:${targetId}:${now}` : groupId === "buyer" ? "buyer" : String(groupId || `solo:${targetId}:${now}`);
  if (targetId.startsWith("runner:")) {
    const runner = (next.run.runners || []).find((entry) => `runner:${entry.id}` === targetId);
    if (!runner) return state;
    runner.groupId = validGroup;
    runner.canCombine = validGroup === "buyer";
  } else if (targetId.startsWith("resource:")) {
    const [, type, id] = targetId.split(":");
    const member = next.run[type]?.find((entry) => entry.id === id);
    if (!member || member.alive !== false) return state;
    member.reviveGroupId = validGroup;
  } else return state;
  syncLegacyRunner(next);
  const target = getPendingDeaths(next).find((entry) => entry.targetId === targetId);
  next.run.history.unshift(historyEvent(now, "revive-group", `${target?.name || "Death"} set to ${validGroup === "buyer" ? "revive near buyer" : "a separate revive"}`));
  return next;
}

export function castResTargets(state, resId, targetIds, now = Date.now(), { force = false, external = false } = {}) {
  const next = clone(state);
  const ids = [...new Set(targetIds || [])].filter(Boolean);
  if (!ids.length) return state;
  const currentTargets = new Map(getPendingDeaths(next).map((entry) => [entry.targetId, entry]));
  const validIds = ids.filter((id) => currentTargets.has(id));
  if (!validIds.length) return state;
  const res = external ? null : next.run.res.find((entry) => entry.id === resId);
  if (!external && (!res || !isUsable(res) || (!force && res.readyAt > now))) return state;
  if (res) {
    res.readyAt = now + resCooldown(res.level);
    res.lastUsedAt = now;
    const usableMain = next.run.res.filter((entry) => isUsable(entry) && entry.main);
    const usedIndex = usableMain.findIndex((entry) => entry.id === resId);
    next.run.nextResId = usableMain.length > 1 ? usableMain[(usedIndex + 1 + usableMain.length) % usableMain.length].id : usableMain[0]?.id || null;
  }
  const names = validIds.map((id) => currentTargets.get(id).name);
  validIds.forEach((id) => reviveTarget(next, id));
  syncLegacyRunner(next);
  next.run.lastResTarget = validIds;
  const actor = external ? "External / untracked Res" : res.name;
  next.run.history.unshift(historyEvent(now, force || external ? "override-res" : "res", `${actor} used Res on ${names.join(" + ")}`));
  return next;
}

export function overrideRevive(state, targetIds, now = Date.now()) {
  const next = clone(state);
  const targets = new Map(getPendingDeaths(next).map((entry) => [entry.targetId, entry]));
  const ids = [...new Set(targetIds || [])].filter((id) => targets.has(id));
  if (!ids.length) return state;
  ids.forEach((id) => reviveTarget(next, id));
  syncLegacyRunner(next);
  next.run.history.unshift(historyEvent(now, "override", `Manual correction: ${ids.map((id) => targets.get(id).name).join(" + ")} marked revived`));
  return next;
}

function reviveTarget(state, targetId) {
  if (targetId === "buyer") {
    state.run.buyerDeadlineAt = null;
    [...state.run.res, ...state.run.tl].filter((entry) => entry.ownerBuyer && entry.online !== false).forEach((entry) => {
      entry.alive = true;
      entry.deadDeadlineAt = null;
      entry.reviveGroupId = null;
    });
    return;
  }
  if (targetId.startsWith("runner:")) {
    state.run.runners = (state.run.runners || []).filter((entry) => `runner:${entry.id}` !== targetId);
    return;
  }
  const [, type, id] = targetId.split(":");
  const member = state.run[type]?.find((entry) => entry.id === id);
  if (member && member.online !== false) {
    member.alive = true;
    member.deadDeadlineAt = null;
    member.reviveGroupId = null;
  }
}

export function castTl(state, tlId, now = Date.now()) {
  const next = clone(state);
  const tl = next.run.tl.find((entry) => entry.id === tlId);
  if (!tl || !isUsable(tl) || tl.readyAt > now) return next;

  tl.readyAt = now + tlCooldown(tl.level);
  tl.lastUsedAt = now;
  const usableTl = next.run.tl.filter(isUsable);
  const usedIndex = usableTl.findIndex((entry) => entry.id === tlId);
  next.run.nextTlId = usableTl.length > 1 ? usableTl[(usedIndex + 1 + usableTl.length) % usableTl.length].id : usableTl[0]?.id || null;
  let resetCount = 0;
  next.run.res.forEach((res) => {
    if (!isUsable(res)) return;
    res.readyAt = now;
    resetCount += 1;
  });
  next.run.history.unshift(historyEvent(now, "tl", `${tl.name} used Time Leap; ${resetCount} Res reset`));
  return next;
}

export function recordOverrideTl(state, tlId = null, now = Date.now()) {
  const next = clone(state);
  const tl = tlId ? next.run.tl.find((entry) => entry.id === tlId) : null;
  if (tl) {
    if (!isUsable(tl)) return state;
    tl.readyAt = now + tlCooldown(tl.level);
    tl.lastUsedAt = now;
  }
  let resetCount = 0;
  next.run.res.forEach((res) => {
    if (!isUsable(res)) return;
    res.readyAt = now;
    resetCount += 1;
  });
  next.run.history.unshift(historyEvent(now, "override-tl", `${tl?.name || "External / untracked TL"} used Time Leap; ${resetCount} Res reset (manual correction)`));
  return next;
}

export function markRunnerSafe(state, targetId = null, now = Date.now()) {
  const next = clone(state);
  next.run.runners ||= [];
  const target = targetId ? next.run.runners.find((entry) => `runner:${entry.id}` === targetId) : next.run.runners[0];
  if (target) next.run.history.unshift(historyEvent(now, "runner", `${target.name} is no longer awaiting a revive`));
  next.run.runners = target ? next.run.runners.filter((entry) => entry.id !== target.id) : next.run.runners;
  syncLegacyRunner(next);
  return next;
}

export function updateSettingsPreservingRun(state, settings, now = Date.now()) {
  const normalized = normalizeSettings(settings);
  const next = clone(state);
  next.settings = normalized;
  next.run.res = mergeRuntimeProviders(normalized.resUsers, state.run.res, now);
  next.run.tl = mergeRuntimeProviders(normalized.tlUsers, state.run.tl, now);
  next.run.nextResId = next.run.res.some((entry) => entry.id === state.run.nextResId) ? state.run.nextResId : next.run.res[0]?.id || null;
  next.run.nextTlId = next.run.tl.some((entry) => entry.id === state.run.nextTlId) ? state.run.nextTlId : next.run.tl[0]?.id || null;
  next.run.history.unshift(historyEvent(now, "setup", "Party setup updated; active timers and cooldowns preserved"));
  syncLegacyRunner(next);
  return next;
}

export function undoLastEvent(state) {
  const stack = getUndoStack(state);
  if (!stack.length) return state;
  const restored = compactUndoState(stack.at(-1));
  restored.run.undoStack = stack.slice(0, -1).map(compactUndoState);
  return restored;
}

export function withUndo(previous, next) {
  if (next === previous || !next.run.history?.length) return next;
  next.run.history.forEach((event) => { delete event.snapshot; });
  next.run.undoStack = [...getUndoStack(previous).map(compactUndoState), compactUndoState(previous)].slice(-UNDO_LIMIT);
  if (next.run.history.length > 30) next.run.history.length = 30;
  return next;
}

function getUndoStack(state) {
  if (Array.isArray(state.run.undoStack) && state.run.undoStack.length) return state.run.undoStack;
  const legacySnapshot = state.run.history?.[0]?.snapshot;
  return legacySnapshot ? [legacySnapshot] : [];
}

function compactUndoState(state) {
  const snapshot = clone(state);
  snapshot.run.undoStack = [];
  snapshot.run.history?.forEach((event) => { delete event.snapshot; });
  return snapshot;
}

export function availableRes(state, now = Date.now()) {
  return state.run.res.filter((res) => isUsable(res) && res.readyAt <= now);
}

export function availableTl(state, now = Date.now()) {
  return state.run.tl.filter((tl) => isUsable(tl) && tl.readyAt <= now);
}

export function preferredRes(state, now = Date.now(), target = "buyer") {
  return sortResChoices(availableRes(state, now), state, target)[0] || null;
}

export function nextTl(state) {
  return state.run.tl.filter(isUsable).sort((a, b) => {
    if (a.readyAt !== b.readyAt) return a.readyAt - b.readyAt;
    return a.id === state.run.nextTlId ? -1 : 1;
  })[0];
}

export function sortResChoices(resources, state, target = "buyer") {
  return [...resources].sort((a, b) => {
    if (a.backup !== b.backup) return a.backup ? 1 : -1;
    if (a.sed !== b.sed) return a.sed ? 1 : -1;
    if (target === "buyer" && a.party !== b.party) {
      if (a.party === "mules") return -1;
      if (b.party === "mules") return 1;
    }
    if (a.id === state.run.nextResId) return -1;
    if (b.id === state.run.nextResId) return 1;
    return a.name.localeCompare(b.name);
  });
}

function isUsable(provider) {
  return provider.online !== false && provider.alive !== false;
}

export function getCycleSustainability(state, now = Date.now()) {
  const usableRes = state.run.res.filter(isUsable);
  const usableTl = state.run.tl.filter(isUsable);
  if (!usableRes.length) {
    return {
      sustainable: false,
      reason: "No living, connected Resurrection user is available.",
      recovery: "Revive a Res user or restore one with Undo if this was a misclick.",
      backupRequired: false,
    };
  }

  const firstDeadline = Number.isFinite(state.run.buyerDeadlineAt) ? Math.max(now, state.run.buyerDeadlineAt) : now + SAFE_WINDOW;
  const sustainable = simulateSustainability(state, firstDeadline);
  const withoutBackupRes = simulateSustainability(state, firstDeadline, { excludeBackupRes: true });
  const counts = `${usableRes.length} Res + ${usableTl.length} TL`;
  if (!sustainable) {
    return {
      sustainable: false,
      reason: `${counts} cannot produce a usable Res for every nine-minute buyer window with the current cooldowns.`,
      recovery: "A dead skill user, an additional Res, or a faster TL may restore the cycle.",
      backupRequired: false,
    };
  }

  return {
    sustainable: true,
    reason: `${counts} can maintain the buyer cycle.`,
    recovery: null,
    backupRequired: !withoutBackupRes,
  };
}

export function simulateSustainability(state, firstDeadline, { excludeBackupRes = false, cycles = PLANNER_CYCLES } = {}) {
  const res = state.run.res
    .filter((entry) => isUsable(entry) && !(excludeBackupRes && entry.backup))
    .map((entry) => ({ id: entry.id, readyAt: entry.readyAt, cooldown: resCooldown(entry.level) }));
  const tl = state.run.tl
    .filter(isUsable)
    .map((entry) => ({ id: entry.id, readyAt: entry.readyAt, cooldown: tlCooldown(entry.level) }));
  if (!res.length) return false;

  const memo = new Map();
  function search(cycle, deadline, resReady, tlReady) {
    if (cycle >= cycles) return true;
    const relative = [
      ...resReady.map((value) => Math.ceil((value - deadline) / SECOND)),
      "|",
      ...tlReady.map((value) => Math.ceil((value - deadline) / SECOND)),
    ].join(",");
    const key = `${cycle}:${relative}`;
    if (memo.has(key)) return memo.get(key);
    memo.set(key, false);

    const readyResIndexes = resReady.map((value, index) => value <= deadline ? index : -1).filter((index) => index >= 0);
    const readyTlIndexes = tlReady.map((value, index) => value <= deadline ? index : -1).filter((index) => index >= 0);
    const seenBranches = new Set();

    function tryBranch(nextResReady, nextTlReady) {
      const branchKey = `${nextResReady.join(",")}|${nextTlReady.join(",")}`;
      if (seenBranches.has(branchKey)) return false;
      seenBranches.add(branchKey);
      return search(cycle + 1, deadline + SAFE_WINDOW, nextResReady, nextTlReady);
    }

    for (const resIndex of readyResIndexes) {
      const usedRes = [...resReady];
      usedRes[resIndex] = deadline + res[resIndex].cooldown;
      if (tryBranch(usedRes, [...tlReady])) {
        memo.set(key, true);
        return true;
      }
      for (const tlIndex of readyTlIndexes) {
        const resetRes = usedRes.map(() => deadline);
        const usedTl = [...tlReady];
        usedTl[tlIndex] = deadline + tl[tlIndex].cooldown;
        if (tryBranch(resetRes, usedTl)) {
          memo.set(key, true);
          return true;
        }
      }
    }

    for (const tlIndex of readyTlIndexes) {
      const resetRes = resReady.map(() => deadline);
      const usedTl = [...tlReady];
      usedTl[tlIndex] = deadline + tl[tlIndex].cooldown;
      for (let resIndex = 0; resIndex < resetRes.length; resIndex += 1) {
        const usedRes = [...resetRes];
        usedRes[resIndex] = deadline + res[resIndex].cooldown;
        if (tryBranch(usedRes, usedTl)) {
          memo.set(key, true);
          return true;
        }
      }
    }

    return false;
  }

  return search(0, firstDeadline, res.map((entry) => entry.readyAt), tl.map((entry) => entry.readyAt));
}

function instruction(kind, tone, title, detail, steps = [], meta = {}) {
  return { kind, tone, title, detail, steps, ...meta };
}

export function getRecommendation(state, now = Date.now()) {
  if (!state.run.active) {
    return instruction("start", "idle", "START THE RUN", "Click Start Run when the service begins. Record Buyer died separately when it happens.");
  }

  if (state.run.buyerOnline === false) {
    return instruction("buyer-disconnected", "danger", "BUYER DISCONNECTED", "The AFK service cannot continue after the buyer leaves the run.");
  }

  const cycle = getCycleSustainability(state, now);
  const readyRes = availableRes(state, now);
  const readyTl = availableTl(state, now);
  const res = preferredRes(state, now, state.run.runner ? "runner" : "buyer");
  const tl = nextTl(state);
  const tlWait = tl ? Math.max(0, tl.readyAt - now) : Number.POSITIVE_INFINITY;
  const runner = state.run.runner;

  if (!Number.isFinite(state.run.buyerDeadlineAt)) {
    return buyerAliveRecommendation(state, now, readyRes, readyTl, res, tl, tlWait, runner, cycle);
  }

  const buyerRemaining = state.run.buyerDeadlineAt - now;
  if (buyerRemaining <= 0) {
    return instruction("failed", "danger", "BUYER WINDOW MISSED", "AFK buyer service has failed. Use Res if appropriate, then record the next Buyer died event.");
  }

  if (!cycle.sustainable) {
    const recovery = deadProviderRecovery(state, now, readyRes);
    if (recovery) return recovery;
  }

  if (!runner) return normalRecommendation(state, now, buyerRemaining, readyRes, readyTl, tl, cycle);

  const runnerRemaining = runner.deadlineAt - now;
  if (runnerRemaining <= 0) {
    return instruction(
      "runner-expired",
      "danger",
      `${runner.name.toUpperCase()} WINDOW MISSED`,
      "Clear the runner event and continue protecting the buyer.",
    );
  }

  if (runner.canCombine) {
    return combinedRecommendation(state, now, buyerRemaining, runnerRemaining, readyRes, res, tl, tlWait);
  }

  return separateRecommendation(state, now, buyerRemaining, runnerRemaining, readyRes, res, tl, tlWait);
}

function buyerAliveRecommendation(state, now, readyRes, readyTl, res, tl, tlWait, runner, cycle) {
  if (!runner) {
    if (!cycle.sustainable) {
      const recovery = deadProviderRecovery(state, now, readyRes);
      if (recovery) return recovery;
      return instruction("cycle-unsustainable", "danger", "BUYER SERVICE WILL FAIL", cycle.reason, [cycle.recovery]);
    }
    if (!readyRes.length && readyTl.length) {
      return tlNowInstruction(readyTl, "Reset the available Res users before the buyer dies again.");
    }
    return instruction("await-buyer-death", "idle", "WAIT FOR BUYER DEATH", "Click Buyer died when the buyer dies to start the nine-minute revive window.");
  }

  const runnerRemaining = runner.deadlineAt - now;
  if (runnerRemaining <= 0) {
    return instruction("runner-expired", "danger", `${runner.name.toUpperCase()} WINDOW MISSED`, "Clear the runner event and continue waiting for the buyer.");
  }

  const readyMainRes = readyRes.filter((entry) => !entry.backup);
  const runnerRes = preferredRes({ ...state, run: { ...state.run, res: readyMainRes } }, now, "runner");

  if (runner.canCombine && readyRes.length) {
    return instruction(
      "await-combined-death",
      runnerRemaining <= MINUTE ? "urgent" : "wait",
      "WAIT FOR BUYER DEATH",
      `If the buyer dies, revive both together. Otherwise revive ${runner.name} before ${formatDuration(runnerRemaining)}.`,
      ["Click Buyer died if the buyer dies", `Otherwise use a main Res on ${runner.name}`],
      { actorId: runnerRes?.id || res.id, target: "both", waitMs: runnerRemaining },
    );
  }

  if (readyMainRes.length) {
    const choices = sortResChoices(readyMainRes, state, "runner");
    return instruction("res-runner", "action", `RES ${runner.name.toUpperCase()} NOW`, `Main choices: ${formatResChoices(choices)}.`, [
      `Res ${runner.name} with a main Bishop`,
    ], { actorId: choices[0].id, target: "runner" });
  }

  if (readyRes.length) {
    return instruction("save-backup-res", "danger", "SAVE BACKUP RES FOR BUYER", `${runner.name} requires a separate revive, but only emergency Res remains.`);
  }

  if (tlWait <= runnerRemaining) {
    return instruction(
      "wait-tl-runner",
      tlWait === 0 ? "action" : "wait",
      tlWait === 0 ? "USE A READY TL NOW" : `WAIT ${formatDuration(tlWait)} FOR TL`,
      `Then revive ${runner.name}. If the buyer dies first and the runner is nearby, revive both.`,
      [`TL ${tl.name}`, `Res ${runner.name}${runner.canCombine ? " or both" : ""}`],
      { actorId: tl.id, waitMs: tlWait },
    );
  }

  return instruction("runner-unavailable", "danger", "NO RUNNER REVIVE IN TIME", `No Resurrection or Time Leap will be ready before ${runner.name}'s window expires.`);
}

function normalRecommendation(state, now, buyerRemaining, readyRes, readyTl, tl, cycle) {
  if (readyRes.length === 0) {
    if (readyTl.length) {
      return tlNowInstruction(readyTl, "Reset every living Res user, then revive the buyer.", [`Res buyer by ${formatDuration(buyerRemaining)}`]);
    }
    const nextResAt = state.run.res.filter(isUsable).reduce((minimum, entry) => Math.min(minimum, entry.readyAt), Number.POSITIVE_INFINITY);
    const nextReadyAt = Math.min(nextResAt, tl?.readyAt ?? Number.POSITIVE_INFINITY);
    const wait = nextReadyAt - now;
    if (wait <= buyerRemaining) {
      const waitingForTl = (tl?.readyAt ?? Number.POSITIVE_INFINITY) <= nextResAt;
      return instruction(
        waitingForTl ? "wait-tl" : "wait-res",
        "wait",
        `WAIT ${formatDuration(wait)} FOR ${waitingForTl ? "TL" : "RES"}`,
        `${waitingForTl ? earliestTlNames(state, tl.readyAt).join(" or ") : earliestResNames(state, nextResAt).join(" or ")} will be ready before the buyer deadline.`,
        [waitingForTl ? "Use any listed TL" : "Res buyer"],
        { actorId: waitingForTl ? tl?.id : null, waitMs: wait },
      );
    }
    return instruction("failed", "danger", "BUYER SERVICE WILL FAIL", "No Res or TL will be ready before the buyer deadline.");
  }

  const castAt = now + buyerRemaining;
  const main = sortResChoices(readyRes.filter((entry) => !entry.backup), state, "buyer");
  const backup = sortResChoices(readyRes.filter((entry) => entry.backup), state, "buyer");
  const safeMain = main.filter((entry) => actionSustainsAfterRes(state, entry.id, castAt));
  const safeBackup = backup.filter((entry) => actionSustainsAfterRes(state, entry.id, castAt));
  const choices = safeMain.length ? safeMain : safeBackup.length ? safeBackup : main.length ? main : backup;
  const usingBackup = choices.length > 0 && choices.every((entry) => entry.backup);
  const timing = buyerRemaining <= SECOND ? "NOW" : `IN ${formatDuration(buyerRemaining)}`;
  const partyNote = formatResChoices(choices);
  const longTerm = cycle.sustainable || safeMain.length || safeBackup.length;

  if (!longTerm) {
    return instruction(
      "cycle-unsustainable",
      "danger",
      "BUYER SERVICE WILL FAIL",
      `${cycle.reason} The current buyer can still be revived with ${choices.map((entry) => entry.name).join(" or ")}.`,
      [`Res buyer by ${formatDuration(buyerRemaining)}`, cycle.recovery],
      { actorId: choices[0]?.id, target: "buyer", waitMs: buyerRemaining },
    );
  }

  return instruction(
    usingBackup ? "backup-res-buyer" : "wait-buyer",
    !longTerm ? "danger" : usingBackup || buyerRemaining <= MINUTE ? "urgent" : "steady",
    `${usingBackup ? "USE BACKUP RES" : "RES BUYER"} ${timing}`,
    `${usingBackup ? "A backup Res is required. " : ""}${partyNote ? `Choices: ${partyNote}.` : ""}${longTerm ? "" : " This saves the current window, but the long-term cycle remains broken."}`,
    choices.length ? [`Use ${choices.map((entry) => entry.name).join(" or ")}`] : [],
    { actorId: choices[0]?.id, target: "buyer", waitMs: buyerRemaining },
  );
}

function actionSustainsAfterRes(state, resId, castAt) {
  const projected = clone(state);
  const res = projected.run.res.find((entry) => entry.id === resId);
  if (!res) return false;
  res.readyAt = castAt + resCooldown(res.level);
  projected.run.buyerDeadlineAt = null;
  return simulateSustainability(projected, castAt + SAFE_WINDOW);
}

function tlNowInstruction(readyTl, detail, extraSteps = []) {
  const names = readyTl.map((entry) => entry.name);
  return instruction(
    "tl",
    "action",
    readyTl.length > 1 ? "USE ANY READY TL NOW" : `TL NOW — ${names[0].toUpperCase()}`,
    `${detail}${readyTl.length > 1 ? ` Ready choices: ${names.join(" · ")}.` : ""}`,
    [`Use TL: ${names.join(" or ")}`, ...extraSteps],
    { actorId: readyTl.length === 1 ? readyTl[0].id : null },
  );
}

function deadProviderRecovery(state, now, readyRes) {
  if (!readyRes.length) return null;
  const buyerDead = Number.isFinite(state.run.buyerDeadlineAt);
  const buyerStep = buyerDead ? [`Res buyer by ${formatDuration(state.run.buyerDeadlineAt - now)}`] : [];
  const deadTl = state.run.tl.find((entry) => entry.online !== false && entry.alive === false && entry.deadDeadlineAt > now && entry.readyAt <= now);
  if (deadTl) {
    const res = sortResChoices(readyRes.filter((entry) => !entry.backup), state, "runner")[0] || sortResChoices(readyRes, state, "runner")[0];
    return instruction("revive-tl", "urgent", `REVIVE ${deadTl.name.toUpperCase()}, THEN TL`, `${deadTl.name}'s ready TL can restore every living Res user.`, [
      `Use ${res.name}'s Res on ${deadTl.name}`,
      `Use ${deadTl.name}'s TL`,
      ...buyerStep,
    ], { actorId: res.id, targetIds: [`resource:tl:${deadTl.id}`] });
  }
  const deadMainRes = state.run.res.find((entry) => entry.online !== false && entry.alive === false && entry.main && entry.deadDeadlineAt > now && entry.readyAt <= now);
  if (deadMainRes && readyRes.some((entry) => entry.id !== deadMainRes.id && !entry.backup)) {
    const res = sortResChoices(readyRes.filter((entry) => entry.id !== deadMainRes.id && !entry.backup), state, "runner")[0];
    return instruction("revive-res", "urgent", `REVIVE ${deadMainRes.name.toUpperCase()}`, "Restoring this main Bishop gives the planner another Res source.", [
      `Use ${res.name}'s Res on ${deadMainRes.name}`,
      ...buyerStep,
    ], { actorId: res.id, targetIds: [`resource:res:${deadMainRes.id}`] });
  }
  return null;
}

function formatResChoices(resources) {
  return resources.map((entry) => {
    const party = partyLabel(entry.party).replace(" Party", "");
    return `${entry.name} (${party}${entry.sed ? ", Sed" : ""}${entry.backup ? ", backup" : ""})`;
  }).join(" · ");
}

function earliestTlNames(state, readyAt) {
  return state.run.tl.filter((entry) => isUsable(entry) && entry.readyAt === readyAt).map((entry) => entry.name);
}

function earliestResNames(state, readyAt) {
  return state.run.res.filter((entry) => isUsable(entry) && entry.readyAt === readyAt).map((entry) => entry.name);
}

function combinedRecommendation(state, now, buyerRemaining, runnerRemaining, readyRes, res, tl, tlWait) {
  const safeWait = Math.min(buyerRemaining, runnerRemaining);

  if (readyRes.length === 0) {
    const readyTl = availableTl(state, now);
    if (readyTl.length) {
      return tlNowInstruction(readyTl, "Reset every living Res user, then revive the buyer and runner together.", ["Res both"]);
    }
    const nextResAt = state.run.res.filter(isUsable).reduce((minimum, entry) => Math.min(minimum, entry.readyAt), Number.POSITIVE_INFINITY);
    const nextReadyAt = Math.min(nextResAt, tl?.readyAt ?? Number.POSITIVE_INFINITY);
    const wait = nextReadyAt - now;
    if (wait <= safeWait) {
      const waitingForTl = (tl?.readyAt ?? Number.POSITIVE_INFINITY) <= nextResAt;
      return instruction("wait-combined", "wait", `WAIT ${formatDuration(wait)} FOR ${waitingForTl ? "TL" : "RES"}`, "Then revive the buyer and runner together.", [
        waitingForTl ? `Use ${earliestTlNames(state, tl.readyAt).join(" or ")}` : "Res both",
        ...(waitingForTl ? ["Res both"] : []),
      ], { actorId: waitingForTl ? tl?.id : null, waitMs: wait });
    }
    return instruction("failed", "danger", "NO COMBINED REVIVE IN TIME", "No Res or TL becomes available before the first safe deadline.");
  }

  const main = sortResChoices(readyRes.filter((entry) => !entry.backup), state, "buyer");
  const backup = sortResChoices(readyRes.filter((entry) => entry.backup), state, "buyer");
  const choices = main.length ? main : backup;
  const usingBackup = choices.every((entry) => entry.backup);
  const timing = safeWait <= SECOND ? "NOW" : `IN ${formatDuration(safeWait)}`;

  return instruction(
    usingBackup ? "backup-res-both" : "res-both",
    usingBackup ? "urgent" : safeWait <= MINUTE ? "urgent" : "action",
    `${usingBackup ? "USE BACKUP RES ON BOTH" : "RES BOTH"} ${timing}`,
    `Choices: ${formatResChoices(choices)}. One Res revives both targets without an extra cast.`,
    [`Use ${choices.map((entry) => entry.name).join(" or ")} on both`],
    { actorId: choices[0]?.id, target: "both", waitMs: safeWait },
  );
}

function separateRecommendation(state, now, buyerRemaining, runnerRemaining, readyRes, res, tl, tlWait) {
  const main = sortResChoices(readyRes.filter((entry) => !entry.backup), state, "runner");
  const buyerSafeChoices = main.filter((entry) => {
    const projected = clone(state);
    const used = projected.run.res.find((candidate) => candidate.id === entry.id);
    used.readyAt = now + resCooldown(used.level);
    projected.run.runner = null;
    return simulateSustainability(projected, state.run.buyerDeadlineAt);
  });

  if (buyerSafeChoices.length) {
    return instruction("res-runner", "action", `RES ${state.run.runner.name.toUpperCase()} NOW`, `Main choices: ${formatResChoices(buyerSafeChoices)}. The buyer cycle remains sustainable.`, [
      `Use ${buyerSafeChoices.map((entry) => entry.name).join(" or ")}`,
    ], { actorId: buyerSafeChoices[0].id, target: "runner" });
  }

  if (readyRes.length) {
    const buyerChoices = sortResChoices(readyRes, state, "buyer");
    return instruction("save-res", "danger", "SAVE AVAILABLE RES FOR BUYER", `${state.run.runner.name} needs a separate revive, but spending a ready Res now breaks the buyer cycle.`, [
      `Res buyer by ${formatDuration(buyerRemaining)} with ${buyerChoices.map((entry) => entry.name).join(" or ")}`,
    ], { actorId: buyerChoices[0]?.id, target: "buyer", waitMs: buyerRemaining });
  }

  const readyTl = availableTl(state, now);
  if (readyTl.length) {
    return tlNowInstruction(readyTl, `Reset every living Res user, then revive ${state.run.runner.name} and the buyer before their deadlines.`, [
      `Res ${state.run.runner.name}`,
      `Res buyer by ${formatDuration(buyerRemaining)}`,
    ]);
  }

  const safeWait = Math.min(buyerRemaining, runnerRemaining);
  const nextResAt = state.run.res.filter(isUsable).reduce((minimum, entry) => Math.min(minimum, entry.readyAt), Number.POSITIVE_INFINITY);
  const nextReadyAt = Math.min(nextResAt, tl?.readyAt ?? Number.POSITIVE_INFINITY);
  const wait = nextReadyAt - now;
  if (wait <= safeWait) {
    const waitingForTl = (tl?.readyAt ?? Number.POSITIVE_INFINITY) <= nextResAt;
    return instruction("wait-separate", "wait", `WAIT ${formatDuration(wait)} FOR ${waitingForTl ? "TL" : "RES"}`, `Then handle ${state.run.runner.name} and the buyer before their separate deadlines.`, [
      waitingForTl ? `Use ${earliestTlNames(state, tl.readyAt).join(" or ")}` : `Res ${state.run.runner.name}`,
    ], { actorId: waitingForTl ? tl?.id : null, waitMs: wait });
  }

  return instruction("failed", "danger", "NO SAFE RUNNER REVIVE", "No plan can revive the runner separately without missing a deadline. Keep the buyer's remaining Res if possible.");
}

export function getServiceOutlook(state, now = Date.now()) {
  if (!state.run.active) return { sustainable: true, horizonMs: null, text: "Not started" };
  if (state.run.buyerOnline === false) return { sustainable: false, horizonMs: 0, text: "Buyer DC" };
  const cycle = getCycleSustainability(state, now);
  if (!cycle.sustainable) {
    const recovery = deadProviderRecovery(state, now, availableRes(state, now));
    if (recovery) return { sustainable: true, horizonMs: Number.isFinite(state.run.buyerDeadlineAt) ? state.run.buyerDeadlineAt - now : null, text: "Recovery available" };
    return { sustainable: false, horizonMs: 0, tlWait: Number.POSITIVE_INFINITY, text: "Cycle broken" };
  }
  if (!Number.isFinite(state.run.buyerDeadlineAt)) return { sustainable: true, horizonMs: null, text: "Buyer alive" };
  if (state.run.buyerDeadlineAt <= now) return { sustainable: false, horizonMs: 0, text: "Window missed" };
  return {
    sustainable: true,
    horizonMs: state.run.buyerDeadlineAt - now,
    text: cycle.backupRequired ? "Backup required" : "Recoverable",
  };
}

export function buildEventLogText(state, exportedAt = Date.now(), formatDate = (value) => new Date(value).toLocaleString(), runnerNames = {}) {
  const history = state.run.history || [];
  return [
    "AFK Service Helper - Event Log",
    `Buyer: ${state.settings.buyerName}`,
    `Exported: ${formatDate(exportedAt)}`,
    "",
    ...[...history].reverse().map((event) => {
      const runnerName = event.type === "runner-disconnect" ? String(runnerNames[event.id] || "").trim() : "";
      const deathRunnerName = event.type === "runner" && /\bdied(?:;|$)/i.test(event.text) ? String(runnerNames[event.id] || "").trim() : "";
      const deathSuffixAt = deathRunnerName ? event.text.search(/\sdied(?:;|$)/i) : -1;
      const text = runnerName
        ? `${runnerName} disconnected`
        : deathRunnerName && deathSuffixAt >= 0
          ? `${deathRunnerName}${event.text.slice(deathSuffixAt)}`
          : event.text;
      return `[${formatDate(event.at)}] ${text}`;
    }),
    "",
  ].join("\r\n");
}

export function formatDuration(milliseconds, { signed = false } = {}) {
  const negative = milliseconds < 0;
  const magnitude = negative && !signed ? 0 : Math.abs(milliseconds);
  const totalSeconds = Math.ceil(magnitude / SECOND);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const text = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return signed && negative ? `-${text}` : text;
}

function historyEvent(at, type, text) {
  return { id: `${at}-${Math.random().toString(36).slice(2, 8)}`, at, type, text };
}

function clone(value) {
  return structuredClone(value);
}
