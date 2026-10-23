async function nudgeBandWorkout(phase) {
  const api = window.TrainyWearable;
  if (phase === "stop") {
    await api?.stopBandWorkout?.();
    return;
  }
  if (!api?.isNative?.()) return;
  try {
    await api.startBandWorkout();
  } catch {
    // уведомление на браслет не обязательно
  }
}

function startWorkoutTimer() {
  if (workoutTimer.startedAt) return;

  hideFinishNotice();
  closePlanEditor();
  elements.workoutPanel.classList.add("is-active");
  workoutTimer = {
    startedAt: Date.now(),
    stoppedAt: null,
    intervalId: window.setInterval(renderWorkoutTimer, 1000),
  };
  renderWorkoutTimer();
  renderSelectedExercises();
  saveWorkoutDraft();
  updateNativeWidget();
  nudgeBandWorkout("start");
  startLiveBandHr();
  window.Capacitor?.Plugins?.WidgetBridge?.prepareHeartBroadcast?.().catch(() => {});
  window.setTimeout(() => elements.selectedExercises.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
}

function stopWorkoutTimer() {
  if (!workoutTimer.startedAt || workoutTimer.stoppedAt) return;

  workoutTimer.stoppedAt = Date.now();
  if (workoutTimer.intervalId) {
    window.clearInterval(workoutTimer.intervalId);
    workoutTimer.intervalId = null;
  }
  renderWorkoutTimer();
  saveWorkoutDraft();
  nudgeBandWorkout("stop");
  stopLiveBandHr();
}

function resetWorkoutTimer() {
  if (workoutTimer.intervalId) window.clearInterval(workoutTimer.intervalId);
  workoutTimer = {
    startedAt: null,
    stoppedAt: null,
    intervalId: null,
  };
  elements.startWorkoutButton.textContent = "Начать тренировку";
  elements.startWorkoutButton.disabled = false;
  elements.workoutTimerDisplay.textContent = "00:00";
  elements.workoutPanel.classList.remove("is-active");
  stopLiveBandHr();
  if (elements.bandLiveHr) {
    elements.bandLiveHr.hidden = true;
    elements.bandLiveHr.textContent = "";
  }
  restUntil = 0;
  restStartedAt = 0;
  focusUid = null;
  setAllOpen = false;
  finishArmedUntil = 0;
  if (restTick) {
    window.clearInterval(restTick);
    restTick = null;
  }
  updateNativeWidget();
}

function saveWorkoutDraft() {
  const hasStarted = Boolean(workoutTimer.startedAt);
  const hasChanges = selected.some((item) =>
    item.sets.some((set) => set.done || set.rpe || set.mark !== "normal")
  ) || Boolean(elements.afterNotesInput.value.trim());

  if (!hasStarted && !hasChanges) return;

  localStorage.setItem(WORKOUT_DRAFT_KEY, JSON.stringify(buildWorkoutDraft()));
}

function buildWorkoutDraft() {
  return {
    version: 1,
    savedAt: Date.now(),
    sessionUid: workoutSessionUid,
    isActive: elements.workoutPanel.classList.contains("is-active"),
    focusUid,
    restUntil,
    restStartedAt,
    timer: {
      startedAt: workoutTimer.startedAt,
      stoppedAt: workoutTimer.stoppedAt,
    },
    fields: {
      date: elements.dateInput.value,
      readiness: elements.readinessInput.value,
      notes: elements.notesInput.value,
      sessionEffort: elements.sessionEffortInput.value,
      afterNotes: elements.afterNotesInput.value,
    },
    selected: JSON.parse(JSON.stringify(selected)),
  };
}

function restoreWorkoutDraft() {
  const raw = localStorage.getItem(WORKOUT_DRAFT_KEY);
  if (!raw) return;

  try {
    const draft = JSON.parse(raw);
    if (!draft || draft.version !== 1 || !Array.isArray(draft.selected)) return;

    // Черновик без активной тренировки не должен затирать свежий план дня.
    if (!draft.isActive && !draft.timer?.startedAt) {
      localStorage.removeItem(WORKOUT_DRAFT_KEY);
      return;
    }

    if (draft.sessionUid) workoutSessionUid = draft.sessionUid;
    const fields = draft.fields || {};
    elements.dateInput.value = fields.date || elements.dateInput.value;
    elements.readinessInput.value = fields.readiness || elements.readinessInput.value;
    elements.notesInput.value = fields.notes || elements.notesInput.value;
    elements.sessionEffortInput.value = fields.sessionEffort || elements.sessionEffortInput.value;
    elements.afterNotesInput.value = fields.afterNotes || "";
    selected = draft.selected;
    focusUid = selected.some((item) => item.uid === draft.focusUid) ? draft.focusUid : null;
    restUntil = Number(draft.restUntil) > Date.now() ? Number(draft.restUntil) : 0;
    restStartedAt = restUntil ? Number(draft.restStartedAt) || Date.now() : 0;

    if (draft.isActive || draft.timer?.startedAt) {
      elements.workoutPanel.classList.add("is-active");
      workoutTimer = {
        startedAt: draft.timer?.startedAt || Date.now(),
        stoppedAt: draft.timer?.stoppedAt || null,
        intervalId: null,
      };
      if (!workoutTimer.stoppedAt) {
        workoutTimer.intervalId = window.setInterval(renderWorkoutTimer, 1000);
        startLiveBandHr();
      }
      ensureRestTick();
      renderWorkoutTimer();
      setSyncStatus("Восстановил незавершенную тренировку с этого устройства.");
    }
  } catch {
    localStorage.removeItem(WORKOUT_DRAFT_KEY);
  }
}

function clearWorkoutDraft() {
  localStorage.removeItem(WORKOUT_DRAFT_KEY);
}

function renderWorkoutTimer() {
  elements.workoutTimerDisplay.textContent = formatDuration(getWorkoutDurationMs());
  paintLiveStrip();
}

function getWorkoutDurationMs() {
  if (!workoutTimer.startedAt) return 0;
  return (workoutTimer.stoppedAt || Date.now()) - workoutTimer.startedAt;
}

function setFinishButtonState(mode) {
  const button = elements.finishWorkoutButton;
  if (!button) return;
  button.disabled = mode === "saving";
  button.textContent = mode === "saving" ? "Сохраняю..." : "Завершить тренировку";
}

function showToast(message, tone = "success", { actionLabel, onAction, duration } = {}) {
  let container = document.querySelector("#toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${tone}`;
  toast.setAttribute("role", "status");
  const text = document.createElement("span");
  text.textContent = message;
  toast.appendChild(text);
  const hide = () => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 350);
  };
  if (actionLabel && onAction) {
    toast.classList.add("has-action");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toast-action";
    button.textContent = actionLabel;
    button.addEventListener("click", () => {
      hide();
      onAction();
    });
    toast.appendChild(button);
  }
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  setTimeout(hide, duration || (actionLabel ? 6000 : 2800));
}

// Последняя сохранённая тренировка и её черновик: если «Завершить» нажали случайно,
// тренировку можно вернуть в редактор, не теряя отметок и таймера.
let lastFinishedWorkout = null;

function resumeFinishedWorkout() {
  const finished = lastFinishedWorkout;
  if (!finished) return;
  if (workoutTimer.startedAt && !workoutTimer.stoppedAt) {
    showToast("Сейчас идёт другая тренировка — сначала заверши её", "warn");
    return;
  }
  lastFinishedWorkout = null;

  const index = state.workouts.indexOf(finished.workout);
  if (index >= 0) {
    state.workouts.splice(index, 1);
    saveState();
    window.cloudSync?.deleteWorkout?.(finished.workout);
  }
  stopAiRun();
  localStorage.removeItem(AI_POST_WORKOUT_PENDING_KEY);
  dropPendingAiPlan();

  localStorage.setItem(WORKOUT_DRAFT_KEY, JSON.stringify({
    ...finished.draft,
    isActive: true,
    timer: { startedAt: finished.draft.timer?.startedAt || Date.now(), stoppedAt: null },
  }));
  hideFinishNotice();
  restoreWorkoutDraft();
  render();
  renderAiChat();
  window.showAppView?.("workout");
  showToast("Тренировка снова открыта — продолжай");
}

function showFinishNotice(workout, pushedToCloud) {
  const doneSets = workout.exercises.reduce((sum, item) => sum + item.sets.filter((set) => set.done).length, 0);
  const totalSets = workout.exercises.reduce((sum, item) => sum + item.sets.length, 0);
  const rows = workout.exercises.map((item) => {
    const exercise = findExercise(item.exerciseId);
    const done = item.sets.filter((set) => set.done).length;
    const total = item.sets.length;
    const status = done === total ? "готово" : `${done}/${total}`;
    return `<li><span>${escapeHtml(exercise.name)}</span><strong>${status}</strong></li>`;
  });

  elements.finishNotice.hidden = false;
  elements.finishNotice.className = "finish-notice is-synced";
  elements.finishNotice.innerHTML = `
    <div class="finish-notice-header">
      <span>Готово, сильная работа</span>
      <strong>${doneSets}/${totalSets} подходов</strong>
    </div>
    <p>${pushedToCloud ? "Тренировка сохранена в облаке." : "Тренировка сохранена."}</p>
    ${workout.durationMs ? `<p>Длительность: <strong>${formatDuration(workout.durationMs)}</strong></p>` : ""}
    ${wearableCardHtml(workout.wearable)}
    <ol class="finish-summary-list">${rows.join("")}</ol>
    <button class="button ghost" type="button" data-action="resume-workout">Нажал случайно — вернуться к тренировке</button>
  `;
  elements.finishNotice.querySelector('[data-action="resume-workout"]')
    ?.addEventListener("click", resumeFinishedWorkout);
  elements.finishNotice.scrollIntoView({ behavior: "smooth", block: "start" });
}

function hideFinishNotice() {
  elements.finishNotice.hidden = true;
  elements.finishNotice.innerHTML = "";
}

const DELETE_UNDO_MS = 8000;
const pendingCloudDeletes = new Map();

function flushCloudDelete(workout) {
  if (!pendingCloudDeletes.has(workout)) return;
  window.clearTimeout(pendingCloudDeletes.get(workout));
  pendingCloudDeletes.delete(workout);
  window.cloudSync?.deleteWorkout?.(workout);
}

function flushAllCloudDeletes() {
  [...pendingCloudDeletes.keys()].forEach(flushCloudDelete);
}

function deleteWorkoutAt(index) {
  const workout = state.workouts[index];
  if (!workout) return;

  state.workouts.splice(index, 1);
  saveState();
  if (lastFinishedWorkout?.workout === workout) lastFinishedWorkout = null;
  if (!workoutsOnDate(workout.date).length) selectedDayIso = null;
  render();
  renderDayDetail();

  // Из облака удаляем только после окна отмены, иначе «Вернуть» пришлось бы заливать заново.
  const cloudTimer = window.setTimeout(() => flushCloudDelete(workout), DELETE_UNDO_MS);
  pendingCloudDeletes.set(workout, cloudTimer);
  showToast(`Тренировка ${formatDate(workout.date)} удалена`, "success", {
    actionLabel: "Вернуть",
    duration: DELETE_UNDO_MS,
    onAction: () => {
      if (pendingCloudDeletes.has(workout)) {
        window.clearTimeout(pendingCloudDeletes.get(workout));
        pendingCloudDeletes.delete(workout);
      } else {
        window.cloudSync?.pushWorkout?.(workout);
      }
      state.workouts.push(workout);
      state.workouts.sort((a, b) => a.date.localeCompare(b.date));
      saveState();
      render();
      renderDayDetail();
      showToast("Тренировка возвращена");
    },
  });
}

function upsertWorkout(workout) {
  const key = workout.id || `${workout.date}-${workout.notes || ""}`;
  state.workouts = state.workouts.filter((item) => (item.id || `${item.date}-${item.notes || ""}`) !== key);
  state.workouts.push(workout);
}
