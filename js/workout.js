function renderSelectedExercises(options = {}) {
  const listWasOpen = Boolean(elements.selectedExercises.querySelector(".set-rest-list[open]"));
  const scrollY = window.scrollY;
  elements.selectedExercises.innerHTML = "";
  if (workoutIsLive()) renderSetFocus();

  const host = workoutIsLive() ? collapsedPlanHost() : elements.selectedExercises;
  selected.forEach((item, index) => host.appendChild(renderExerciseCard(item, index)));
  if (workoutIsLive() && listWasOpen) {
    const details = elements.selectedExercises.querySelector(".set-rest-list");
    if (details) details.open = true;
  }

  renderPlanSummary();
  renderWorkoutHeading();
  paintRestTimer();
  paintSetHeart();
  if (workoutIsLive()) {
    if (options.scrollToFocus) document.querySelector(".set-focus")?.scrollIntoView({ block: "nearest" });
    else window.scrollTo(0, scrollY);
    updateNativeWidget();
  }
}

let setAllOpen = false;

function collapsedPlanHost() {
  const details = document.createElement("details");
  details.className = "set-rest-list";
  const done = selected.filter(isExerciseComplete).length;
  details.innerHTML = `<summary>Все упражнения · ${done}/${selected.length}</summary>`;
  const body = document.createElement("div");
  details.appendChild(body);
  elements.selectedExercises.appendChild(details);
  const add = document.createElement("button");
  add.type = "button";
  add.className = "button secondary live-add-exercise";
  add.textContent = "+ Добавить упражнение";
  add.addEventListener("click", openExercisePicker);
  elements.selectedExercises.appendChild(add);
  return body;
}

function focusExercise() {
  const current = selected.find((item) => item.uid === focusUid);
  if (current) return current;
  return selected.find((item) => !isExerciseComplete(item)) || selected[0] || null;
}

function renderSetFocus() {
  const item = focusExercise();
  focusUid = item?.uid || null;
  const card = document.createElement("section");
  card.className = "set-focus";
  if (!item) {
    card.innerHTML = `<p class="set-next">Добавь упражнение — оно станет текущим подходом.</p>`;
    elements.selectedExercises.appendChild(card);
    return;
  }

  const exercise = findExercise(item.exerciseId);
  const undone = item.sets.findIndex((set) => !set.done);
  const setIndex = undone >= 0 ? undone : Math.max(0, item.sets.length - 1);
  const set = item.sets[setIndex];
  const next = selected.find((entry) => entry.uid !== item.uid && !isExerciseComplete(entry))
    || selected[selected.indexOf(item) + 1];
  const nextName = next ? findExercise(next.exerciseId)?.name : "";

  card.innerHTML = `
    <div class="set-head">
      <p class="set-kicker">Подход ${setIndex + 1} из ${item.sets.length}</p>
      <h3 class="set-name">${escapeHtml(exercise.name)}</h3>
    </div>
    <p class="set-sub">${escapeHtml(exerciseSubtitle(exercise, item))}</p>
    <p class="set-hr" id="setHrReadout" hidden></p>
    <div class="set-current"></div>
    <details class="set-all"${setAllOpen ? " open" : ""}>
      <summary>Все подходы · ${item.sets.filter((entry) => entry.done).length}/${item.sets.length}</summary>
      <div class="set-all-list"></div>
      <button class="button ghost add-set" type="button">+ подход</button>
    </details>
    <div class="rest-timer" hidden>
      <span>Отдых</span>
      <strong data-rest-clock>1:30</strong>
      <button type="button" data-rest="-15">−15</button>
      <button type="button" data-rest="15">+15</button>
      <button type="button" data-rest="skip">Дальше</button>
    </div>
    <p class="set-next">${nextName ? `Дальше: ${escapeHtml(nextName)}` : "Это последнее упражнение"}</p>
  `;
  if (set) card.querySelector(".set-current").appendChild(renderSetRow(item.uid, setIndex, set, exercise));
  const allList = card.querySelector(".set-all-list");
  item.sets.forEach((entry, index) => {
    if (index === setIndex) return;
    allList.appendChild(renderSetRow(item.uid, index, entry, exercise));
  });
  card.querySelector(".set-all").addEventListener("toggle", (event) => {
    setAllOpen = event.currentTarget.open;
  });
  card.querySelector(".add-set").addEventListener("click", () => {
    const last = item.sets.at(-1) || { weight: 0, reps: 10, rpe: "" };
    item.sets.push({ ...last, rpe: "", done: false, mark: "normal" });
    renderSelectedExercises();
    saveWorkoutDraft();
  });
  card.querySelectorAll("[data-rest]").forEach((button) => {
    button.addEventListener("click", () => adjustRest(button.dataset.rest));
  });
  elements.selectedExercises.appendChild(card);
}

function renderExerciseCard(item, index) {
  const exercise = findExercise(item.exerciseId);
  const fragment = elements.exerciseTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".exercise-card");
  card.dataset.uid = item.uid;
  if (isExerciseComplete(item)) card.classList.add("exercise-complete");
  if (workoutIsLive() && item.uid === focusUid) card.classList.add("exercise-current");
  const indexBadge = card.querySelector(".exercise-index");
  if (indexBadge) indexBadge.textContent = String(index + 1);
  card.querySelector("h3").textContent = exercise.name;
  card.querySelector("p").textContent = exerciseSubtitle(exercise, item);
  const moveUpButton = card.querySelector(".move-up");
  const moveDownButton = card.querySelector(".move-down");
  const actions = card.querySelector(".exercise-card-actions");
  if (workoutIsLive() && actions) {
    const focusButton = document.createElement("button");
    focusButton.className = "icon-button focus-exercise";
    focusButton.type = "button";
    focusButton.textContent = "▶";
    focusButton.title = "Сделать текущим";
    focusButton.setAttribute("aria-label", "Сделать упражнение текущим");
    focusButton.disabled = item.uid === focusUid;
    focusButton.addEventListener("click", () => setFocusExercise(item.uid));
    actions.prepend(focusButton);
  }
  moveUpButton.disabled = index === 0;
  moveDownButton.disabled = index === selected.length - 1;
  moveUpButton.addEventListener("click", () => moveSelectedExercise(item.uid, -1));
  moveDownButton.addEventListener("click", () => moveSelectedExercise(item.uid, 1));
  card.querySelector(".remove-exercise").addEventListener("click", () => {
    selected = selected.filter((selectedItem) => selectedItem.uid !== item.uid);
    if (focusUid === item.uid) focusUid = null;
    renderSelectedExercises();
    saveWorkoutDraft();
  });
  card.querySelector("h3").addEventListener("click", () => {
    if (!workoutIsLive()) return;
    setFocusExercise(item.uid);
  });

  const sets = card.querySelector(".sets");
  item.sets.forEach((set, setIndex) => sets.appendChild(renderSetRow(item.uid, setIndex, set, exercise)));
  card.querySelector(".add-set").addEventListener("click", () => {
    const last = item.sets.at(-1) || { weight: 0, reps: 10, rpe: "" };
    item.sets.push({ ...last, rpe: "", done: false, mark: "normal" });
    renderSelectedExercises();
    saveWorkoutDraft();
  });
  return fragment;
}

function setFocusExercise(uid) {
  if (!selected.some((item) => item.uid === uid)) return;
  focusUid = uid;
  renderSelectedExercises({ scrollToFocus: true });
  saveWorkoutDraft();
  updateNativeWidget();
}

function startRest(seconds = 90) {
  restStartedAt = Date.now();
  restUntil = restStartedAt + seconds * 1000;
  ensureRestTick();
  paintRestTimer();
  updateNativeWidget();
}

function ensureRestTick() {
  if (restTick || !restUntil) return;
  restTick = window.setInterval(() => {
    if (restUntil <= Date.now()) {
      restUntil = 0;
      window.clearInterval(restTick);
      restTick = null;
      if (navigator.vibrate) navigator.vibrate(30);
    }
    paintRestTimer();
  }, 250);
}

function adjustRest(action) {
  if (action === "skip") {
    restUntil = 0;
    paintRestTimer();
    saveWorkoutDraft();
    updateNativeWidget();
    return;
  }
  const delta = Number(action) * 1000;
  const base = Math.max(Date.now(), restUntil);
  restUntil = base + delta;
  if (restUntil <= Date.now()) restUntil = 0;
  if (restUntil && !restTick) startRest(Math.ceil((restUntil - Date.now()) / 1000));
  paintRestTimer();
  saveWorkoutDraft();
  updateNativeWidget();
}

function restSecondsLeft() {
  return Math.max(0, Math.ceil((restUntil - Date.now()) / 1000));
}

function paintRestTimer() {
  const box = document.querySelector(".set-focus .rest-timer");
  if (!box) return;
  const seconds = restSecondsLeft();
  box.hidden = seconds <= 0;
  if (seconds <= 0) return;
  const clock = box.querySelector("[data-rest-clock]");
  if (clock) clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function paintSetHeart() {
  const node = document.querySelector("#setHrReadout");
  if (!node) return;
  const reading = liveBandHr;
  const age = reading ? Date.now() - reading.at : Infinity;
  const bpm = reading?.bpm && age <= 20 * 60 * 1000 ? reading.bpm : null;
  const live = Boolean(bpm) && age <= 20000;
  node.classList.toggle("is-live", live);
  node.hidden = !bpm;
  if (!bpm) {
    node.textContent = "";
    return;
  }
  if (!live) {
    const sec = Math.max(1, Math.round(age / 1000));
    const ago = sec >= 60 ? `${Math.round(sec / 60)} мин назад` : `${sec} с назад`;
    node.textContent = `♥ ${bpm} · ${ago}`;
    return;
  }
  node.textContent = `♥ ${bpm}`;
}

function moveSelectedExercise(uid, direction) {
  const currentIndex = selected.findIndex((item) => item.uid === uid);
  const targetIndex = currentIndex + direction;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= selected.length) return;

  const live = workoutIsLive();
  const title = findExerciseTitle(uid);
  const previousTitleTop = !live && title ? title.getBoundingClientRect().top : null;
  [selected[currentIndex], selected[targetIndex]] = [selected[targetIndex], selected[currentIndex]];
  renderSelectedExercises();
  saveWorkoutDraft();
  if (live) {
    const card = findExerciseCard(uid);
    card?.classList.add("exercise-moved");
    window.setTimeout(() => card?.classList.remove("exercise-moved"), 500);
    return;
  }
  keepExerciseTitleInView(uid, previousTitleTop, direction);
}

function exerciseSubtitle(exercise, item) {
  const parts = [`${exercise.group} · ${exercise.unit}`];
  if (item.sourceNote) parts.push(item.sourceNote);
  return parts.join(" · ");
}

function findExerciseCard(uid) {
  return elements.selectedExercises.querySelector(`[data-uid="${uid}"]`);
}

function findExerciseTitle(uid) {
  return findExerciseCard(uid)?.querySelector(".exercise-card-header h3");
}

function keepExerciseTitleInView(uid, previousTitleTop, direction) {
  const card = findExerciseCard(uid);
  const title = findExerciseTitle(uid);
  if (!card || !title) return;
  if (!document.querySelector("#planEditor")?.hidden) {
    title.scrollIntoView({ block: "nearest" });
    card.classList.add("exercise-moved");
    window.setTimeout(() => card.classList.remove("exercise-moved"), 500);
    return;
  }

  // Карточки разной высоты, поэтому якорь — именно название перемещаемого
  // упражнения. Оно остаётся на той же высоте экрана после перестановки.
  if (previousTitleTop != null) {
    const delta = title.getBoundingClientRect().top - previousTitleTop;
    if (delta) window.scrollBy({ top: delta, behavior: "auto" });
  }

  const timer = elements.workoutPanel?.querySelector(".session-timer");
  const topSafe = ((timer && timer.getBoundingClientRect().bottom) || 8) + 8;
  const bottomSafe = window.innerHeight - 110;
  const titleRect = title.getBoundingClientRect();
  if (titleRect.top < topSafe) {
    window.scrollBy({ top: titleRect.top - topSafe, behavior: "auto" });
  } else if (titleRect.bottom > bottomSafe) {
    window.scrollBy({ top: titleRect.bottom - bottomSafe, behavior: "auto" });
  }

  card.classList.add("exercise-moved");
  window.setTimeout(() => card.classList.remove("exercise-moved"), 500);
  if (direction) {
    card.querySelector(direction < 0 ? ".move-up" : ".move-down")?.focus({ preventScroll: true });
  }
}

function planWeightBrief(exercise, sets) {
  if (!sets.length) return "";

  if (exercise.cardio) {
    const minutes = sets.reduce((sum, set) => sum + (Number(set.weight) || 0), 0);
    return minutes ? `${formatNumber(minutes)} мин` : "";
  }

  const weights = sets.map((set) => Number(set.weight) || 0).filter(Boolean);
  const reps = sets.map((set) => Number(set.reps) || 0).filter(Boolean);
  const repsText = reps.length
    ? (Math.min(...reps) === Math.max(...reps)
      ? `${Math.max(...reps)} повт`
      : `${Math.min(...reps)}–${Math.max(...reps)} повт`)
    : "";
  if (!weights.length) return repsText;

  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const unit = shortUnit(exercise);
  const weightText = minWeight === maxWeight
    ? `${formatNumber(maxWeight)} ${unit}`
    : `${formatNumber(minWeight)}–${formatNumber(maxWeight)} ${unit}`;
  return repsText ? `${weightText} × ${repsText}` : weightText;
}

function renderPlanSummary() {
  const totalSets = selected.reduce((sum, item) => sum + item.sets.length, 0);
  const rows = selected.map((item, order) => {
    const exercise = findExercise(item.exerciseId);
    const brief = planWeightBrief(exercise, item.sets);
    return `
      <li>
        <span><b>${order + 1}.</b> ${escapeHtml(exercise.name)}${brief ? `<small>${brief}</small>` : ""}</span>
        <strong>${item.sets.length} подх.</strong>
      </li>
    `;
  });

  elements.planSummary.innerHTML = `
    <div class="plan-summary-stats">
      <strong>${selected.length}</strong><span>упражнений</span>
      <strong>${totalSets}</strong><span>подходов</span>
    </div>
    <ol class="plan-summary-list">
      ${rows.join("")}
    </ol>
  `;
}

function isExerciseComplete(item) {
  return item.sets.length > 0 && item.sets.every((set) => set.done);
}

// Ощущение подхода вместо ручного RPE. RPE в истории остаётся: его выводим из метки,
// аналитика и тренер дальше работают с числом.
const SET_FEEL = [
  { value: "very-easy", label: "совсем легко", rpe: 5 },
  { value: "easy", label: "легко", rpe: 6 },
  { value: "normal", label: "в самый раз", rpe: 7 },
  { value: "solid", label: "плотно", rpe: 8 },
  { value: "hard", label: "тяжело", rpe: 9 },
  { value: "skip", label: "пропустил", rpe: "" },
];

function feelRpe(mark) {
  const level = SET_FEEL.find((item) => item.value === (mark || "normal"));
  return level ? level.rpe : 7;
}

function feelOptions(mark) {
  const current = SET_FEEL.some((item) => item.value === mark) ? mark : "normal";
  return SET_FEEL.map((item) =>
    `<option value="${item.value}" ${item.value === current ? "selected" : ""}>${item.label}</option>`
  ).join("");
}

function renderSetRow(uid, index, set, exercise) {
  const row = document.createElement("div");
  row.className = `set-row${set.done ? " set-done" : ""}`;
  const loadLabel = exercise.cardio ? "Минуты" : "Вес";
  const repsLabel = exercise.cardio ? "Инт." : "Повторы";
  row.innerHTML = `
    <label class="done-cell"><input type="checkbox" ${set.done ? "checked" : ""} data-field="done" /><span>${set.done ? "Готово" : `Подход ${index + 1}`}</span></label>
    <label>${loadLabel}
      <span class="stepper">
        <input type="number" step="0.5" value="${set.weight}" data-field="weight" />
        <button type="button" data-adjust="weight" data-delta="${-Math.abs(exercise.step || 2.5)}">−</button>
        <button type="button" data-adjust="weight" data-delta="${Math.abs(exercise.step || 2.5)}">+</button>
      </span>
    </label>
    <label>${repsLabel}
      <span class="stepper">
        <input type="number" step="1" value="${set.reps}" data-field="reps" />
        <button type="button" data-adjust="reps" data-delta="-1">−</button>
        <button type="button" data-adjust="reps" data-delta="1">+</button>
      </span>
    </label>
    <label class="feel-cell">Как зашло
      <select data-field="mark">${feelOptions(set.mark)}</select>
    </label>
    <button class="delete-set" type="button" aria-label="Убрать подход" title="Убрать подход">×</button>
  `;

  row.querySelectorAll("input[data-field], select[data-field]").forEach((input) => {
    const updateSet = () => {
      const item = selected.find((selectedItem) => selectedItem.uid === uid);
      item.sets[index][input.dataset.field] = input.type === "checkbox" ? input.checked : input.value;
      if (input.dataset.field === "mark") item.sets[index].rpe = feelRpe(input.value);
      if (input.dataset.field === "done") {
        // Метка времени подхода — основа для разбора пульса по упражнениям и отдыху.
        item.sets[index].doneAt = input.checked ? Date.now() : null;
        if (input.checked) {
          item.sets[index].rpe = feelRpe(item.sets[index].mark);
          startRest();
          if (isExerciseComplete(item)) {
            const upcoming = selected.find((entry) => entry.uid !== item.uid && !isExerciseComplete(entry));
            if (upcoming) focusUid = upcoming.uid;
          }
        }
        renderSelectedExercises();
        updateNativeWidget();
      }
      saveWorkoutDraft();
    };
    input.addEventListener("input", updateSet);
    input.addEventListener("change", updateSet);
  });

  row.querySelectorAll("button[data-adjust]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = selected.find((selectedItem) => selectedItem.uid === uid);
      const field = button.dataset.adjust;
      const delta = Number(button.dataset.delta);
      const current = Number(item.sets[index][field]) || 0;
      item.sets[index][field] = Math.max(0, current + delta);
      renderSelectedExercises();
      saveWorkoutDraft();
    });
  });

  row.querySelector(".delete-set").addEventListener("click", () => {
    const item = selected.find((selectedItem) => selectedItem.uid === uid);
    item.sets.splice(index, 1);
    renderSelectedExercises();
    saveWorkoutDraft();
  });

  return row;
}

function collectWorkout() {
  const durationMs = getWorkoutDurationMs();
  const completedDate = completedWorkoutDate(elements.dateInput.value);
  return {
    id: `manual-${completedDate}-${workoutSessionUid}`,
    date: completedDate,
    readiness: elements.readinessInput.value,
    notes: elements.notesInput.value.trim(),
    sessionEffort: elements.sessionEffortInput.value,
    afterNotes: elements.afterNotesInput.value.trim(),
    durationMs: durationMs || null,
    durationMinutes: durationMs ? Math.round(durationMs / 60000) : null,
    // Границы сессии нужны, чтобы позже перечитать пульс с браслета.
    startedAt: workoutTimer.startedAt ? new Date(workoutTimer.startedAt).toISOString() : null,
    endedAt: workoutTimer.startedAt
      ? new Date(workoutTimer.stoppedAt || Date.now()).toISOString()
      : null,
    exercises: selected
      .map((item) => ({
        exerciseId: item.exerciseId,
        sets: item.sets
          .map((set) => ({
            weight: Number(set.weight),
            reps: Number(set.reps),
            rpe: Number(set.rpe) || null,
            done: Boolean(set.done),
            doneAt: set.doneAt || null,
            mark: set.mark || "normal",
          }))
          .filter((set) => set.reps > 0),
      }))
      .filter((item) => item.sets.length),
  };
}

function completedWorkoutDate(selectedDate) {
  const today = formatInputDate(new Date());
  return selectedDate && selectedDate <= today ? selectedDate : today;
}

async function copyWorkoutReport() {
  const workout = collectWorkout();
  const report = buildWorkoutReport(workout);

  try {
    await copyText(report);
    elements.copyReportButton.textContent = "Отчет скопирован";
    setTimeout(() => {
      elements.copyReportButton.textContent = "Отчет";
    }, 1800);
  } catch {
    window.prompt("Скопируй отчет для чата:", report);
  }
}

async function copyText(value) {
  await navigator.clipboard.writeText(value);
}

function buildWorkoutReport(workout) {
  const lines = [
    `Тренировка ${formatDate(workout.date)}`,
    `Самочувствие до: ${readinessLabel(workout.readiness)}`,
    `Итог: ${sessionEffortLabel(workout.sessionEffort)}`,
  ];

  if (workout.durationMs) lines.push(`Длительность: ${formatDuration(workout.durationMs)}`);
  const bandLine = wearableReportLine(workout.wearable);
  if (bandLine) lines.push(bandLine);
  if (workout.notes) lines.push(`План/заметки до: ${workout.notes}`);
  if (workout.afterNotes) lines.push(`Заметки после: ${workout.afterNotes}`);
  lines.push("");

  workout.exercises.forEach((item) => {
    const exercise = findExercise(item.exerciseId);
    lines.push(`- ${exercise.name}`);
    item.sets.forEach((set, index) => {
      const status = set.done ? "✓" : "□";
      const workload = exercise.cardio
        ? `${formatNumber(set.weight)} мин`
        : `${set.weight ? `${formatNumber(set.weight)} ${exercise.unit}, ` : ""}${set.reps} повт`;
      const rpe = set.rpe ? `, RPE ${set.rpe}` : "";
      lines.push(`  ${status} ${index + 1}. ${workload}${rpe}, ${setMarkLabel(set.mark)}`);
    });
  });

  lines.push("");
  lines.push("Скорректируй следующую тренировку по этим меткам.");
  return lines.join("\n");
}

function sessionEffortLabel(value) {
  return {
    fresh: "вышел бодрее, чем зашел",
    normal: "нормально, без перегруза",
    hard: "тяжело, но контролируемо",
    "too-hard": "перебор / надо облегчить",
  }[value] || "не указано";
}

function setMarkLabel(value) {
  return {
    easy: "легко",
    normal: "норм",
    hard: "тяжело",
    skip: "скип",
  }[value] || "норм";
}
