import {
  BODY_PARTS,
  MINUTE,
  PARTY_OPTIONS,
  SAFE_WINDOW,
  availableRes,
  availableTl,
  buildEventLogText,
  castRes,
  castResTargets,
  castTl,
  createInitialState,
  crossedDeathTimerAlert,
  disconnectMember,
  disconnectPendingTarget,
  formatDuration,
  getRecommendation,
  getPendingDeaths,
  getReviveGroups,
  getServiceOutlook,
  markRunnerSafe,
  migrateState,
  partyLabel,
  recordBodyPartDeath,
  recordBuyerDeath,
  recordBuyerDisconnect,
  recordRunnerDeath,
  recordRunnerDisconnect,
  recordMemberDeath,
  recordOverrideTl,
  renameRunner,
  resCooldown,
  reviveMember,
  overrideRevive,
  setDeathGroup,
  startRun,
  tlCooldown,
  undoLastEvent,
  updateSettingsPreservingRun,
  withUndo,
} from "./engine.js";

const STORAGE_KEY = "afk-service-helper-state-v1";
const BODY_PARTS_COLLAPSED_KEY = "afk-service-helper-body-parts-collapsed";
const $ = (selector) => document.querySelector(selector);

const firstVisit = localStorage.getItem(STORAGE_KEY) === null;
let bodyPartsCollapsed = localStorage.getItem(BODY_PARTS_COLLAPSED_KEY) === "true";
let state = loadState();
let now = Date.now();
let restartArmedUntil = 0;
const timerTrackers = {
  buyer: { deadlineAt: null, remaining: null },
  runner: { deadlineAt: null, remaining: null },
};

const elements = {
  buyerName: $("#buyer-name"),
  buyerState: $("#buyer-state"),
  buyerTimer: $("#buyer-timer"),
  buyerDiedButton: $("#buyer-died-button"),
  buyerDisconnectedButton: $("#buyer-disconnected-button"),
  history: $("#history-list"),
  exportButton: $("#export-button"),
  instructions: $(".app-instructions"),
  levelWarning: $("#level-warning"),
  nextCard: $("#next-card"),
  nextDetail: $("#next-detail"),
  nextSteps: $("#next-steps"),
  nextTitle: $("#next-title"),
  outlook: $("#service-outlook"),
  resCards: $("#res-cards"),
  bodyPartButtons: $("#body-part-buttons"),
  bodyPartsSection: $("#body-parts-section"),
  bodyPartsToggle: $("#body-parts-toggle"),
  pendingDeaths: $("#pending-death-list"),
  runnerClear: $("#runner-clear-button"),
  runnerName: $("#runner-name"),
  runnerState: $("#runner-state"),
  runnerTimer: $("#runner-timer"),
  runnerTogetherButton: $("#runner-together-button"),
  runnerSeparateButton: $("#runner-separate-button"),
  runnerDisconnectedButton: $("#runner-disconnected-button"),
  saveIndicator: $("#save-indicator"),
  settingsDialog: $("#settings-dialog"),
  overrideDialog: $("#override-dialog"),
  overrideResCaster: $("#override-res-caster"),
  overrideResTargets: $("#override-res-targets"),
  overrideTlActions: $("#override-tl-actions"),
  overrideReviveActions: $("#override-revive-actions"),
  settingsForm: $("#settings-form"),
  extraResSettings: $("#extra-res-settings"),
  extraTlSettings: $("#extra-tl-settings"),
  startButton: $("#start-button"),
  tlCards: $("#tl-cards"),
  undoButton: $("#undo-button"),
};

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (![1, 2].includes(parsed?.version)) return createInitialState();
    const savedParts = parsed.run.bodyParts || {};
    parsed.run.bodyParts = Object.fromEntries(BODY_PARTS.map((part) => [
      part,
      Boolean(savedParts[part] || (part === "Left Arm" && savedParts["Left Hand"]) || (part === "Right Arm" && savedParts["Right Hand"])),
    ]));
    parsed.run.res.forEach((entry) => { entry.online ??= true; });
    parsed.run.tl.forEach((entry) => { entry.online ??= true; });
    const legacyUndo = parsed.run.history?.[0]?.snapshot;
    const savedUndoStack = Array.isArray(parsed.run.undoStack) ? parsed.run.undoStack : legacyUndo ? [legacyUndo] : [];
    parsed.run.undoStack = savedUndoStack.slice(-30).filter((snapshot) => snapshot?.run).map((snapshot) => {
      snapshot.run.undoStack = [];
      snapshot.run.history?.forEach((event) => { delete event.snapshot; });
      return snapshot;
    });
    parsed.run.history?.forEach((event) => { delete event.snapshot; });
    parsed.run.lastResTarget ??= null;
    parsed.run.buyerOnline ??= true;
    return migrateState(parsed);
  } catch {
    return createInitialState();
  }
}

function commit(next) {
  restartArmedUntil = 0;
  state = withUndo(state, next);
  persistState();
  render();
}

function persistState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    elements.saveIndicator.textContent = "Saved";
  } catch {
    elements.saveIndicator.textContent = "Storage full · not saved";
  }
}

function render({ rebuild = true } = {}) {
  now = Date.now();
  renderRecommendation();
  renderPeople();
  if (!rebuild) updatePendingTimers();
  renderResources(rebuild);
  if (rebuild) {
    renderPendingDeaths();
    renderBodyParts();
    renderHistory();
  }
  const restartArmed = state.run.active && restartArmedUntil > now;
  elements.startButton.textContent = state.run.active ? (restartArmed ? "Confirm restart" : "Restart run") : "Start run";
  elements.startButton.title = state.run.active
    ? (restartArmed ? "Click again to restart the run and reset every timer." : "Click once to arm restart confirmation for three seconds.")
    : "Record that the run started. The buyer timer begins only when Buyer died is clicked.";
  elements.startButton.classList.toggle("restart-armed", restartArmed);
  elements.runnerClear.hidden = true;
  const buyerDead = Number.isFinite(state.run.buyerDeadlineAt) && state.run.buyerOnline !== false;
  elements.buyerDiedButton.disabled = !state.run.active || state.run.buyerOnline === false || buyerDead;
  elements.buyerDisconnectedButton.disabled = !state.run.active || state.run.buyerOnline === false;
  elements.runnerTogetherButton.disabled = !state.run.active;
  elements.runnerSeparateButton.disabled = !state.run.active;
  elements.runnerDisconnectedButton.disabled = !state.run.active;
  elements.undoButton.disabled = !(state.run.undoStack?.length || state.run.history?.[0]?.snapshot);
  elements.exportButton.disabled = !(state.run.history || []).length;
}

function renderRecommendation() {
  const recommendation = getRecommendation(state, now);
  const outlook = getServiceOutlook(state, now);
  const toneClass = `tone-${recommendation.tone}`;
  ["tone-idle", "tone-danger", "tone-wait", "tone-urgent", "tone-action", "tone-steady"].forEach((className) => {
    elements.nextCard.classList.toggle(className, className === toneClass);
  });
  setText(elements.nextTitle, recommendation.title);
  setText(elements.nextDetail, recommendation.detail);
  setText(elements.outlook, outlook.text);
  const stepsKey = recommendation.steps.join("\u001f");
  if (elements.nextSteps.dataset.stepsKey !== stepsKey) {
    elements.nextSteps.replaceChildren(...recommendation.steps.map((step) => {
      const item = document.createElement("li");
      item.textContent = step;
      return item;
    }));
    elements.nextSteps.dataset.stepsKey = stepsKey;
  }
}

function renderPeople() {
  setText(elements.buyerName, state.settings.buyerName);
  if (!state.run.active) {
    setText(elements.buyerTimer, formatDuration(SAFE_WINDOW));
    elements.buyerTimer.classList.remove("muted");
    updateDeathTimer("buyer", elements.buyerTimer, null, SAFE_WINDOW);
    setPill(elements.buyerState, "neutral", "Waiting");
  } else if (state.run.buyerOnline === false) {
    setText(elements.buyerTimer, "—");
    elements.buyerTimer.classList.add("muted");
    updateDeathTimer("buyer", elements.buyerTimer, null, SAFE_WINDOW);
    setPill(elements.buyerState, "bad", "Disconnected");
  } else if (!Number.isFinite(state.run.buyerDeadlineAt)) {
    setText(elements.buyerTimer, "—");
    elements.buyerTimer.classList.add("muted");
    updateDeathTimer("buyer", elements.buyerTimer, null, SAFE_WINDOW);
    setPill(elements.buyerState, "good", "Alive");
  } else {
    elements.buyerTimer.classList.remove("muted");
    const remaining = state.run.buyerDeadlineAt - now;
    const outlook = getServiceOutlook(state, now);
    const missed = remaining <= 0;
    const willFail = !missed && !outlook.sustainable;
    setText(elements.buyerTimer, formatDuration(remaining));
    updateDeathTimer("buyer", elements.buyerTimer, state.run.buyerDeadlineAt, remaining);
    setPill(elements.buyerState, missed || willFail || remaining <= MINUTE ? "bad" : remaining <= 3 * MINUTE ? "warn" : "good", missed ? "Missed" : willFail ? "Will fail" : "Protected");
  }

  const nonBuyerDeaths = getPendingDeaths(state).filter((entry) => entry.kind !== "buyer");
  if (nonBuyerDeaths.length) {
    const nextDeath = nonBuyerDeaths[0];
    const remaining = nextDeath.deadlineAt - now;
    setText(elements.runnerName, nonBuyerDeaths.length === 1 ? nextDeath.name : `${nonBuyerDeaths.length} dead`);
    setText(elements.runnerTimer, formatDuration(remaining));
    elements.runnerTimer.classList.remove("muted");
    updateDeathTimer("runner", elements.runnerTimer, nextDeath.deadlineAt, remaining);
    setPill(
      elements.runnerState,
      remaining <= MINUTE ? "bad" : "warn",
      remaining <= 0 ? "Missed" : nonBuyerDeaths.some((entry) => entry.groupId === "buyer") ? "Near buyer" : "Far from buyer",
    );
  } else {
    setText(elements.runnerName, "None dead");
    setText(elements.runnerTimer, "—");
    elements.runnerTimer.classList.add("muted");
    updateDeathTimer("runner", elements.runnerTimer, null, SAFE_WINDOW);
    setPill(elements.runnerState, "good", "Alive");
  }
}

function updateDeathTimer(key, element, deadlineAt, remaining) {
  const active = Number.isFinite(deadlineAt);
  element.classList.toggle("active", active);
  element.classList.toggle("danger", active && remaining <= MINUTE);
  element.classList.toggle("expired", active && remaining <= 0);

  const tracker = timerTrackers[key] ||= { deadlineAt: null, remaining: null };
  if (!active) {
    tracker.deadlineAt = null;
    tracker.remaining = null;
    return;
  }

  const isNewTimer = tracker.deadlineAt !== deadlineAt;
  const previous = isNewTimer
    ? (SAFE_WINDOW - remaining < 1_000 ? SAFE_WINDOW + 1 : remaining)
    : tracker.remaining;
  if (crossedDeathTimerAlert(previous, remaining) !== null) flashDeathTimer(element);
  tracker.deadlineAt = deadlineAt;
  tracker.remaining = remaining;
}

function flashDeathTimer(element) {
  element.classList.remove("flash");
  void element.offsetWidth;
  element.classList.add("flash");
  window.clearTimeout(element.flashTimeout);
  element.flashTimeout = window.setTimeout(() => element.classList.remove("flash"), 700);
}

function renderPendingDeaths() {
  const deaths = getPendingDeaths(state);
  if (!deaths.length) {
    const empty = document.createElement("p");
    empty.className = "pending-empty";
    empty.textContent = "No one is awaiting a revive.";
    elements.pendingDeaths.replaceChildren(empty);
    return;
  }
  const groups = getReviveGroups(state);
  const groupColors = new Map(groups.map((group, index) => [group.id, `group-color-${index % 6}`]));
  elements.pendingDeaths.replaceChildren(...deaths.map((death) => {
    const row = document.createElement("article");
    row.dataset.targetId = death.targetId;
    row.className = `pending-death ${groupColors.get(death.groupId) || "group-color-0"}${death.deadlineAt <= now ? " expired" : ""}`;
    const role = death.kind === "buyer" ? "Buyer" : death.kind === "resource" ? `${death.resourceType === "res" ? "Res" : "TL"} user` : "Runner";
    row.innerHTML = `<div class="pending-person"><strong></strong><small></small></div><strong class="pending-timer death-timer"></strong><fieldset class="pending-group-field"><legend>Revive</legend><div class="pending-group-options"></div></fieldset><button class="connection-button pending-dc" type="button">DC</button>`;
    const pendingName = row.querySelector(".pending-person strong");
    pendingName.textContent = death.name;
    if (death.kind === "runner") {
      const input = document.createElement("input");
      input.className = "pending-name-input";
      input.type = "text";
      input.value = death.name;
      input.maxLength = 24;
      input.autocomplete = "off";
      input.ariaLabel = `Name for ${death.name}`;
      input.title = "Optional live name. Updates Next Action, Res buttons, and the event-log field.";
      input.addEventListener("change", () => {
        const value = input.value.trim();
        if (!value) {
          input.value = death.name;
          return;
        }
        commit(renameRunner(state, death.targetId, value));
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          input.blur();
        }
        if (event.key === "Escape") {
          input.value = death.name;
          input.blur();
        }
      });
      pendingName.replaceWith(input);
    }
    row.querySelector(".pending-person small").textContent = role;
    const timer = row.querySelector(".pending-timer");
    timer.textContent = formatDuration(death.deadlineAt - now);
    updateDeathTimer(`pending-${death.targetId}`, timer, death.deadlineAt, death.deadlineAt - now);
    const field = row.querySelector(".pending-group-field");
    if (death.kind === "buyer") {
      field.innerHTML = "<span class=\"pending-anchor\">Nearby group anchor</span>";
    } else {
      const currentGroup = groups.find((group) => group.id === death.groupId);
      const options = [{ id: "__separate__", label: "Separately", selected: currentGroup?.targets.length === 1 }];
      groups.forEach((group) => {
        const otherNames = group.targets.map((targetId, index) => targetId === death.targetId ? null : group.names[index]).filter(Boolean);
        if (!otherNames.length && group.id !== "buyer") return;
        const label = group.id === "buyer" && !otherNames.length ? "Near buyer" : `With ${otherNames.join(" + ")}`;
        options.push({ id: group.id, label, selected: group.id === death.groupId && group.targets.length > 1 || group.id === "buyer" && death.groupId === "buyer" });
      });
      if (!groups.some((group) => group.id === "buyer") && (Number.isFinite(state.run.buyerDeadlineAt) || death.groupId === "buyer")) {
        options.push({ id: "buyer", label: `With ${state.settings.buyerName}`, selected: death.groupId === "buyer" });
      }
      const name = `revive-group-${death.targetId.replaceAll(":", "-")}`;
      field.querySelector(".pending-group-options").replaceChildren(...options.map((option) => {
        const chip = document.createElement("label");
        chip.className = "pending-group-chip";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = name;
        input.value = option.id;
        input.checked = Boolean(option.selected);
        const text = document.createElement("span");
        text.textContent = option.label;
        input.addEventListener("change", () => commit(setDeathGroup(state, death.targetId, option.id, Date.now())));
        chip.append(input, text);
        return chip;
      }));
    }
    const dc = row.querySelector(".pending-dc");
    dc.title = `Record that ${death.name} disconnected and remove this revive target`;
    dc.addEventListener("click", () => commit(disconnectPendingTarget(state, death.targetId, Date.now())));
    return row;
  }));
}

function updatePendingTimers() {
  const deaths = new Map(getPendingDeaths(state).map((death) => [death.targetId, death]));
  elements.pendingDeaths.querySelectorAll(".pending-death").forEach((row) => {
    const death = deaths.get(row.dataset.targetId);
    if (!death) return;
    const timer = row.querySelector(".pending-timer");
    const remaining = death.deadlineAt - now;
    setText(timer, formatDuration(remaining));
    row.classList.toggle("expired", remaining <= 0);
    updateDeathTimer(`pending-${death.targetId}`, timer, death.deadlineAt, remaining);
  });
}

function renderResources(rebuild = true) {
  const readyResIds = new Set(availableRes(state, now).map((entry) => entry.id));
  const readyTlIds = new Set(availableTl(state, now).map((entry) => entry.id));
  renderResourceGroup(elements.resCards, state.run.res, readyResIds, "res", rebuild);
  renderResourceGroup(elements.tlCards, state.run.tl, readyTlIds, "tl", rebuild);
}

function renderResourceGroup(container, resources, readyIds, type, rebuild) {
  const cardsMatch = container.children.length === resources.length
    && resources.every((resource, index) => container.children[index]?.dataset.resourceId === resource.id);

  if (rebuild || !cardsMatch) {
    container.replaceChildren(...resources.map((resource) => resourceCard(resource, type)));
  }

  resources.forEach((resource, index) => {
    updateResourceCard(container.children[index], resource, readyIds.has(resource.id), type);
  });
}

function resourceCard(resource, type) {
  const card = document.createElement("article");
  card.dataset.resourceId = resource.id;
  card.innerHTML = `<div class="resource-card-top"><div class="resource-name"><strong></strong><small></small></div><span class="resource-time"></span></div><div class="resource-action-block"><span class="resource-action-label"></span><div class="resource-actions"></div></div><div class="connection-row"></div>`;
  const actionBlock = card.querySelector(".resource-action-block");
  const actionLabel = card.querySelector(".resource-action-label");
  const actions = card.querySelector(".resource-actions");
  const connectionRow = card.querySelector(".connection-row");

  if (type === "res") {
    actionLabel.textContent = "Used Res on";
  } else {
    actionLabel.textContent = "";
    actionLabel.setAttribute("aria-hidden", "true");
    const castButton = document.createElement("button");
    castButton.className = "resource-button cast-tl-button";
    castButton.type = "button";
    castButton.textContent = "Used TL";
    castButton.title = `Record ${resource.name} casting Time Leap`;
    castButton.addEventListener("click", () => commit(castTl(state, resource.id, Date.now())));
    actions.append(castButton);
  }

  const memberStateButton = document.createElement("button");
  memberStateButton.className = "member-state-button";
  memberStateButton.type = "button";
  memberStateButton.addEventListener("click", () => {
    const current = state.run[type].find((entry) => entry.id === resource.id);
    if (!current) return;
    commit(current.alive === false
      ? reviveMember(state, type, resource.id, Date.now())
      : recordMemberDeath(state, type, resource.id, Date.now()));
  });
  connectionRow.append(memberStateButton);

  const connectionButton = document.createElement("button");
  connectionButton.className = "connection-button";
  connectionButton.type = "button";
  connectionButton.textContent = "DC";
  connectionButton.title = `Mark ${resource.name} out for the rest of this run`;
  connectionButton.addEventListener("click", () => commit(disconnectMember(state, type, resource.id, Date.now())));
  connectionRow.append(connectionButton);
  return card;
}

function updateResourceCard(card, resource, ready, type) {
  const online = resource.online !== false;
  const alive = resource.alive !== false;
  const className = `resource-card${ready ? " ready" : ""}${online ? "" : " offline"}${alive ? "" : " dead"}${resource.backup ? " backup" : ""}${resource.sed ? " sed" : ""}`;
  if (card.className !== className) card.className = className;

  const cooldownMinutes = type === "tl" ? tlCooldown(resource.level) / MINUTE : resCooldown(resource.level) / MINUTE;
  const role = resource.main ? "MAIN" : type === "res" ? "BACKUP" : "EXTRA";
  const meta = [role, partyLabel(resource.party).replace(" Party", ""), resource.sed ? "SED" : "", `Lv${resource.level}`].filter(Boolean).join(" · ");
  const tooltip = type === "tl"
    ? `${resource.name}: ${role.toLowerCase()} Time Leap, ${partyLabel(resource.party)}, ${cooldownMinutes}-minute cooldown.`
    : `${resource.name}: ${resource.backup ? "backup" : "main"} Resurrection, ${partyLabel(resource.party)}, ${cooldownMinutes}-minute cooldown${resource.sed ? "; avoid moving the Sed Bishop" : ""}.`;
  if (card.title !== tooltip) card.title = tooltip;
  setText(card.querySelector(".resource-name strong"), resource.name);
  setText(card.querySelector(".resource-name small"), meta);
  const time = !online ? "OFFLINE" : !alive ? formatDuration(resource.deadDeadlineAt - now) : ready ? "READY" : formatDuration(resource.readyAt - now);
  setText(card.querySelector(".resource-time"), time);
  updateDeathTimer(`member-${type}-${resource.id}`, card.querySelector(".resource-time"), !online || alive ? null : resource.deadDeadlineAt, !online || alive ? SAFE_WINDOW : resource.deadDeadlineAt - now);

  const memberStateButton = card.querySelector(".member-state-button");
  setText(memberStateButton, alive ? "Died" : "Revived");
  memberStateButton.title = alive ? `Record that ${resource.name} died` : `Record that ${resource.name} was revived`;
  memberStateButton.disabled = !state.run.active || !online;
  card.querySelector(".connection-button").disabled = !state.run.active || !online;
  if (type === "res") {
    const groups = getReviveGroups(state);
    const groupColors = new Map(groups.map((group, index) => [group.id, `group-color-${index % 6}`]));
    const actions = card.querySelector(".resource-actions");
    const key = groups.map((group) => `${group.id}:${group.targets.join(",")}`).join("|");
    if (actions.dataset.groupsKey !== key) {
      actions.replaceChildren(...groups.map((group) => {
        const button = document.createElement("button");
        button.className = `resource-button cast-choice ${groupColors.get(group.id) || "group-color-0"}`;
        button.type = "button";
        button.dataset.target = group.id;
        button.textContent = `Res ${group.names.join(" + ")}`;
        button.title = `Record ${resource.name} using Res on ${group.names.join(" and ")}`;
        button.addEventListener("click", () => commit(castResTargets(state, resource.id, group.targets, Date.now())));
        return button;
      }));
      actions.dataset.groupsKey = key;
    }
    if (!groups.length && !actions.querySelector(".no-res-targets")) {
      const empty = document.createElement("span");
      empty.className = "no-res-targets";
      empty.textContent = "No pending targets";
      actions.replaceChildren(empty);
    }
    actions.querySelectorAll(".cast-choice").forEach((button) => {
      const group = groups.find((entry) => entry.id === button.dataset.target);
      button.disabled = !state.run.active || !ready || !group || group.deadlineAt <= now;
    });
  } else {
    card.querySelector(".cast-tl-button").disabled = !state.run.active || !ready;
  }
}

function renderBodyParts() {
  elements.bodyPartButtons.replaceChildren(...BODY_PARTS.map((part) => {
    const button = document.createElement("button");
    const down = Boolean(state.run.bodyParts?.[part]);
    button.className = `body-part-button ${down ? "down" : ""}`;
    button.dataset.bodyPart = part.toLowerCase().replaceAll(" ", "-");
    button.type = "button";
    button.disabled = down;
    button.innerHTML = `<span></span><small></small>`;
    button.querySelector("span").textContent = part;
    button.querySelector("small").textContent = down ? "Dead" : "Alive";
    button.title = down ? `${part} has been recorded dead.` : `Mark ${part} dead.`;
    button.addEventListener("click", () => commit(recordBodyPartDeath(state, part, Date.now())));
    return button;
  }));
}

function renderBodyPartsVisibility() {
  elements.bodyPartButtons.hidden = bodyPartsCollapsed;
  elements.bodyPartsSection.classList.toggle("collapsed", bodyPartsCollapsed);
  elements.bodyPartsToggle.setAttribute("aria-expanded", String(!bodyPartsCollapsed));
  elements.bodyPartsToggle.textContent = bodyPartsCollapsed ? "Show" : "Hide";
  elements.bodyPartsToggle.title = `${bodyPartsCollapsed ? "Show" : "Hide"} Horntail body status`;
}

function renderInstructionsState() {
  document.body.classList.toggle("instructions-open", elements.instructions.open);
}

function flashInstructionTargets(selector) {
  if (selector.includes(".body-part-button") && bodyPartsCollapsed) {
    bodyPartsCollapsed = false;
    try {
      localStorage.setItem(BODY_PARTS_COLLAPSED_KEY, "false");
    } catch {}
    renderBodyPartsVisibility();
  }

  const targets = [...document.querySelectorAll(selector)];
  if (!targets.length) return;
  targets[0].scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "center",
  });
  targets.forEach((target) => {
    target.classList.remove("instruction-target-flash");
    void target.offsetWidth;
    target.classList.add("instruction-target-flash");
    window.clearTimeout(target.instructionFlashTimeout);
    target.instructionFlashTimeout = window.setTimeout(() => target.classList.remove("instruction-target-flash"), 1_150);
  });
}

function renderHistory() {
  const history = state.run.history || [];
  if (!history.length) {
    const empty = document.createElement("li");
    empty.className = "empty-history";
    empty.textContent = "Events will appear here.";
    elements.history.replaceChildren(empty);
    return;
  }

  const existingItems = new Map(
    [...elements.history.children]
      .filter((item) => item.dataset.eventId)
      .map((item) => [item.dataset.eventId, item]),
  );

  elements.history.replaceChildren(...history.map((event) => {
    const item = existingItems.get(event.id) || createHistoryItem(event);
    const time = new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setText(item.querySelector(".history-time"), time);
    if (acceptsRunnerIgn(event)) {
      setText(item.querySelector(".history-event-text"), event.text);
      const input = item.querySelector(".history-runner-ign");
      input.ariaLabel = `Runner IGN for ${event.type === "runner-disconnect" ? "disconnect" : "death"} at ${time}`;
      const syncedName = event.runnerName || "";
      if (input.dataset.syncedName !== syncedName) {
        input.value = syncedName;
        input.dataset.syncedName = syncedName;
      }
    } else {
      setText(item.querySelector(".history-event-text"), event.text);
    }
    return item;
  }));
}

function createHistoryItem(event) {
  const item = document.createElement("li");
  item.dataset.eventId = event.id;
  if (acceptsRunnerIgn(event)) {
    item.className = "runner-identity-event";
    item.innerHTML = `<span class="history-time"></span><div class="history-event-content"><span class="history-event-text"></span><input class="history-runner-ign" type="text" autocomplete="off" placeholder="Enter runner IGN" /></div>`;
    const input = item.querySelector(".history-runner-ign");
    input.dataset.eventId = event.id;
    input.title = "Used only when Export is clicked; this IGN is not saved.";
  } else {
    item.innerHTML = `<span class="history-time"></span><span class="history-event-text"></span>`;
  }
  return item;
}

function acceptsRunnerIgn(event) {
  return event.type === "runner-disconnect" || (event.type === "runner" && /\bdied(?:;|$)/i.test(event.text));
}

function setPill(element, tone, text) {
  element.className = `pill ${tone}`;
  setText(element, text);
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function openSettings() {
  const form = elements.settingsForm.elements;
  const mainRes = state.settings.resUsers.filter((entry) => entry.main);
  const mainTl = state.settings.tlUsers.filter((entry) => entry.main);
  form.buyerName.value = state.settings.buyerName;
  form.resAName.value = mainRes[0]?.name || "Bishop A";
  form.resBName.value = mainRes[1]?.name || "Bishop B";
  form.resALevel.value = mainRes[0]?.level || 10;
  form.resBLevel.value = mainRes[1]?.level || 10;
  form.resASed.checked = Boolean(mainRes[0]?.sed);
  form.resBSed.checked = Boolean(mainRes[1]?.sed);
  form.tlAName.value = mainTl[0]?.name || "Bucc A";
  form.tlBName.value = mainTl[1]?.name || "Bucc B";
  form.tlALevel.value = mainTl[0]?.level || 30;
  form.tlBLevel.value = mainTl[1]?.level || 30;
  setPartySelect(form.resAParty, mainRes[0]?.party || "main1");
  setPartySelect(form.resBParty, mainRes[1]?.party || "main2");
  setPartySelect(form.tlAParty, mainTl[0]?.party || "main1");
  setPartySelect(form.tlBParty, mainTl[1]?.party || "main2");
  elements.extraResSettings.replaceChildren(...state.settings.resUsers.filter((entry) => !entry.main).map((entry) => extraProviderRow("res", entry)));
  elements.extraTlSettings.replaceChildren(...state.settings.tlUsers.filter((entry) => !entry.main).map((entry) => extraProviderRow("tl", entry)));
  updateLevelWarning();
  elements.settingsDialog.showModal();
}

function updateLevelWarning() {
  const levels = [...elements.settingsForm.querySelectorAll(".tl-level-input")].map((input) => Number(input.value));
  const below = levels.filter((level) => level < 14).length;
  elements.levelWarning.textContent = below
    ? `${below} TL ${below === 1 ? "user is" : "users are"} below Lv14. The planner will use the exact cooldowns and may require more skill providers.`
    : "The planner checks the full combination of Res, TL levels, deaths, disconnects, and natural cooldowns.";
}

function setPartySelect(select, selected = "mules") {
  select.replaceChildren(...PARTY_OPTIONS.map((party) => {
    const option = document.createElement("option");
    option.value = party.id;
    option.textContent = party.label;
    option.selected = party.id === selected;
    return option;
  }));
}

function extraProviderRow(type, provider = {}) {
  const row = document.createElement("div");
  row.className = `provider-setup-row extra-provider-row ${type}-provider-row`;
  row.dataset.providerId = provider.id || `${type}Extra-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  row.dataset.providerType = type;
  row.innerHTML = type === "res"
    ? `<span class="provider-kind">Backup Res</span><label>Name<input class="provider-name" autocomplete="off" required /></label><label>Level<input class="provider-level res-level-input" type="number" min="1" max="10" required /></label><label>Party<select class="provider-party"></select></label><label class="check-label owner-buyer-label"><input class="provider-owner-buyer" type="checkbox" />Buyer character</label><button class="remove-provider" type="button" aria-label="Remove extra Res"></button>`
    : `<span class="provider-kind">Extra TL</span><label>Name<input class="provider-name" autocomplete="off" required /></label><label>Level<input class="provider-level tl-level-input" type="number" min="1" max="30" required /></label><label>Party<select class="provider-party"></select></label><label class="check-label owner-buyer-label"><input class="provider-owner-buyer" type="checkbox" />Buyer character</label><button class="remove-provider" type="button" aria-label="Remove extra TL"></button>`;
  row.querySelector(".provider-name").value = provider.name || (type === "res" ? "Extra Bishop" : "TL Mule");
  row.querySelector(".provider-level").value = provider.level || (type === "tl" ? 30 : 10);
  row.querySelector(".provider-owner-buyer").checked = Boolean(provider.ownerBuyer);
  setPartySelect(row.querySelector(".provider-party"), provider.party || "mules");
  row.querySelector(".remove-provider").addEventListener("click", () => {
    row.remove();
    updateLevelWarning();
  });
  return row;
}

function collectExtraProviders(container, type) {
  return [...container.querySelectorAll(".extra-provider-row")].map((row) => ({
    id: row.dataset.providerId,
    name: row.querySelector(".provider-name").value.trim(),
    main: false,
    party: row.querySelector(".provider-party").value,
    ...(type === "res"
      ? { backup: true, level: Number(row.querySelector(".provider-level").value) }
      : { level: Number(row.querySelector(".provider-level").value) }),
    ownerBuyer: row.querySelector(".provider-owner-buyer").checked,
  }));
}

function makeOverrideButton(label, onClick, className = "secondary-button") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", () => {
    onClick();
    elements.overrideDialog.close();
  });
  return button;
}

function openOverride() {
  const groups = getReviveGroups(state);
  const casterOptions = [{ id: "external", label: "External / untracked Res" }, ...state.run.res.map((entry) => ({ id: entry.id, label: `${entry.name}${entry.online === false ? " (DC)" : entry.alive === false ? " (dead)" : ""}` }))];
  elements.overrideResCaster.replaceChildren(...casterOptions.map((entry) => {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.label;
    return option;
  }));
  elements.overrideResTargets.replaceChildren(...(groups.length ? groups.map((group) => makeOverrideButton(
    `Res ${group.names.join(" + ")}`,
    () => {
      const caster = elements.overrideResCaster.value;
      commit(castResTargets(state, caster === "external" ? null : caster, group.targets, Date.now(), { force: true, external: caster === "external" }));
    },
    "primary-button",
  )) : [Object.assign(document.createElement("p"), { className: "pending-empty", textContent: "No pending deaths to revive." })]));

  const tlButtons = [
    makeOverrideButton("External / untracked TL", () => commit(recordOverrideTl(state, null, Date.now()))),
    ...state.run.tl.filter((entry) => entry.online !== false && entry.alive !== false).map((entry) => makeOverrideButton(`${entry.name} used TL`, () => commit(recordOverrideTl(state, entry.id, Date.now())))),
  ];
  elements.overrideTlActions.replaceChildren(...tlButtons);
  elements.overrideReviveActions.replaceChildren(...(groups.length ? groups.map((group) => makeOverrideButton(
    `Mark ${group.names.join(" + ")} revived`,
    () => commit(overrideRevive(state, group.targets, Date.now())),
  )) : [Object.assign(document.createElement("p"), { className: "pending-empty", textContent: "No pending deaths to correct." })]));
  elements.overrideDialog.showModal();
}

$("#settings-button").addEventListener("click", openSettings);
$("#override-button").addEventListener("click", openOverride);
$("#add-extra-res").addEventListener("click", () => elements.extraResSettings.append(extraProviderRow("res")));
$("#add-extra-tl").addEventListener("click", () => {
  elements.extraTlSettings.append(extraProviderRow("tl"));
  updateLevelWarning();
});
elements.buyerDiedButton.addEventListener("click", () => commit(recordBuyerDeath(state, Date.now())));
elements.buyerDisconnectedButton.addEventListener("click", () => commit(recordBuyerDisconnect(state, Date.now())));
$("#runner-together-button").addEventListener("click", () => recordInlineRunnerDeath(true));
$("#runner-separate-button").addEventListener("click", () => recordInlineRunnerDeath(false));
$("#runner-disconnected-button").addEventListener("click", () => {
  commit(recordRunnerDisconnect(state, Date.now()));
});
document.querySelectorAll(".instruction-link").forEach((button) => {
  button.addEventListener("click", () => flashInstructionTargets(button.dataset.flashTarget));
});
elements.instructions.addEventListener("toggle", renderInstructionsState);
elements.bodyPartsToggle.addEventListener("click", () => {
  bodyPartsCollapsed = !bodyPartsCollapsed;
  try {
    localStorage.setItem(BODY_PARTS_COLLAPSED_KEY, String(bodyPartsCollapsed));
  } catch {}
  renderBodyPartsVisibility();
});
elements.startButton.addEventListener("click", () => {
  if (!state.run.active) {
    commit(startRun(state));
    return;
  }
  if (restartArmedUntil > Date.now()) {
    commit(startRun(state));
    return;
  }
  restartArmedUntil = Date.now() + 3_000;
  render({ rebuild: false });
});
$("#reset-button").addEventListener("click", () => {
  if (window.confirm("Reset all live timers and cooldowns? Party setup will be kept.")) commit(createInitialState(state.settings));
});
elements.runnerClear.addEventListener("click", () => commit(markRunnerSafe(state)));
elements.undoButton.addEventListener("click", () => {
  restartArmedUntil = 0;
  state = undoLastEvent(state);
  persistState();
  render();
});
elements.exportButton.addEventListener("click", exportEventLog);

document.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "z") return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;
  if (elements.undoButton.disabled) return;
  event.preventDefault();
  elements.undoButton.click();
});

function exportEventLog() {
  const history = state.run.history || [];
  if (!history.length) return;
  const runnerNames = Object.fromEntries(
    [...elements.history.querySelectorAll(".history-runner-ign")]
      .map((input) => [input.dataset.eventId, input.value]),
  );
  const blob = new Blob([buildEventLogText(state, Date.now(), undefined, runnerNames)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().replaceAll(":", "-").replace("T", "_").slice(0, 19);
  link.href = url;
  link.download = `afk-service-log_${stamp}.txt`;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

document.querySelectorAll(".close-dialog").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});

document.addEventListener("click", (event) => {
  if (event.target instanceof HTMLInputElement && !["radio", "checkbox", "button", "submit"].includes(event.target.type)) {
    event.target.select();
  }
});

function recordInlineRunnerDeath(canCombine) {
  if (!state.run.active) return;
  commit(recordRunnerDeath(state, { canCombine }, Date.now()));
}

elements.settingsForm.addEventListener("input", updateLevelWarning);
elements.settingsForm.addEventListener("change", (event) => {
  if (!event.target.matches('[name="resASed"], [name="resBSed"]') || !event.target.checked) return;
  const otherName = event.target.name === "resASed" ? "resBSed" : "resASed";
  elements.settingsForm.elements[otherName].checked = false;
});
elements.settingsForm.addEventListener("submit", (event) => {
  if (event.submitter?.value !== "save") return;
  event.preventDefault();
  const form = new FormData(elements.settingsForm);
  const settings = {
    buyerName: form.get("buyerName").trim(),
    resUsers: [
      { id: "resA", name: form.get("resAName").trim(), level: Number(form.get("resALevel")), main: true, party: form.get("resAParty"), sed: form.has("resASed") },
      { id: "resB", name: form.get("resBName").trim(), level: Number(form.get("resBLevel")), main: true, party: form.get("resBParty"), sed: form.has("resBSed") },
      ...collectExtraProviders(elements.extraResSettings, "res"),
    ],
    tlUsers: [
      { id: "tlA", name: form.get("tlAName").trim(), level: Number(form.get("tlALevel")), main: true, party: form.get("tlAParty") },
      { id: "tlB", name: form.get("tlBName").trim(), level: Number(form.get("tlBLevel")), main: true, party: form.get("tlBParty") },
      ...collectExtraProviders(elements.extraTlSettings, "tl"),
    ],
  };
  const next = state.run.active ? updateSettingsPreservingRun(state, settings, Date.now()) : createInitialState(settings);
  commit(next);
  elements.settingsDialog.close();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) render({ rebuild: false });
});

setInterval(() => render({ rebuild: false }), 250);
renderInstructionsState();
renderBodyPartsVisibility();
render();

if (firstVisit) queueMicrotask(openSettings);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
