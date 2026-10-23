// Грузится последним: состояние ниже при загрузке вызывает функции из остальных файлов js/,
// а boot() в конце рассчитывает, что они все уже объявлены.

let state = loadState();
let selected = [];
let dayPlans = {};
let editingPlanIso = null;
let isFinishingWorkout = false;
let finishArmedUntil = 0;
let focusUid = null;
let restUntil = 0;
let restStartedAt = 0;
let restTick = null;
// Стабильный id на сессию: повторное "Завершить" перезапишет запись, а не создаст дубль.
let workoutSessionUid = makeUid();
let aiChat = loadAiChat();
let workoutTimer = {
  startedAt: null,
  stoppedAt: null,
  intervalId: null,
};
let liveBandHrTimer = null;
let musicTimer = null;
let musicState = null;

const elements = {
  statsGrid: document.querySelector("#statsGrid"),
  resetButton: document.querySelector("#resetButton"),
  cabinetStatus: document.querySelector("#cabinetStatus"),
  workoutPanel: document.querySelector(".workout-panel"),
  workoutForm: document.querySelector("#workoutForm"),
  startWorkoutButton: document.querySelector("#startWorkoutButton"),
  workoutTimerDisplay: document.querySelector("#workoutTimerDisplay"),
  finishNotice: document.querySelector("#finishNotice"),
  finishWorkoutButton: document.querySelector("#finishWorkoutButton"),
  planSummary: document.querySelector("#planSummary"),
  dateInput: document.querySelector("#dateInput"),
  readinessInput: document.querySelector("#readinessInput"),
  notesInput: document.querySelector("#notesInput"),
  sessionEffortInput: document.querySelector("#sessionEffortInput"),
  afterNotesInput: document.querySelector("#afterNotesInput"),
  exerciseSearchInput: document.querySelector("#exerciseSearchInput"),
  exercisePickList: document.querySelector("#exercisePickList"),
  copyReportButton: document.querySelector("#copyReportButton"),
  selectedExercises: document.querySelector("#selectedExercises"),
  exerciseTemplate: document.querySelector("#exerciseTemplate"),
  coachBox: document.querySelector("#coachBox"),
  aiChatLog: document.querySelector("#aiChatLog"),
  aiChatInput: document.querySelector("#aiChatInput"),
  aiChatSendButton: document.querySelector("#aiChatSendButton"),
  aiChatStopButton: document.querySelector("#aiChatStopButton"),
  aiChatClearButton: document.querySelector("#aiChatClearButton"),
  aiStatus: document.querySelector("#aiStatus"),
  aiApiKeyInput: document.querySelector("#aiApiKeyInput"),
  saveAiApiKeyButton: document.querySelector("#saveAiApiKeyButton"),
  aiBaseUrlInput: document.querySelector("#aiBaseUrlInput"),
  saveAiBaseUrlButton: document.querySelector("#saveAiBaseUrlButton"),
  readinessPill: document.querySelector("#readinessPill"),
  prBoard: document.querySelector("#prBoard"),
  weightChart: document.querySelector("#weightChart"),
  volumeChart: document.querySelector("#volumeChart"),
  historyList: document.querySelector("#historyList"),
  gymList: document.querySelector("#gymList"),
  gymStatus: document.querySelector("#gymStatus"),
  gymSelectAllButton: document.querySelector("#gymSelectAllButton"),
  gymFromHistoryButton: document.querySelector("#gymFromHistoryButton"),
  builderGoalSelect: document.querySelector("#builderGoalSelect"),
  builderDurationSelect: document.querySelector("#builderDurationSelect"),
  buildWorkoutButton: document.querySelector("#buildWorkoutButton"),
  accentPicker: document.querySelector("#accentPicker"),
  scheduleCalendar: document.querySelector("#scheduleCalendar"),
  calTitle: document.querySelector("#calTitle"),
  calPrevButton: document.querySelector("#calPrevButton"),
  calNextButton: document.querySelector("#calNextButton"),
  calendarStats: document.querySelector("#calendarStats"),
  dayDetail: document.querySelector("#dayDetail"),
  weekdayPicker: document.querySelector("#weekdayPicker"),
  calModeButton: document.querySelector("#calModeButton"),
  workoutTitle: document.querySelector("#workoutTitle"),
  workoutEyebrow: document.querySelector("#workoutEyebrow"),
  wearableStatus: document.querySelector("#wearableStatus"),
  wearableStats: document.querySelector("#wearableStats"),
  wearableConnectButton: document.querySelector("#wearableConnectButton"),
  wearableRefreshButton: document.querySelector("#wearableRefreshButton"),
  wearableSettingsButton: document.querySelector("#wearableSettingsButton"),
  wearableApplyHint: document.querySelector("#wearableApplyHint"),
  bandPageMeta: document.querySelector("#bandPageMeta"),
  bandSleepCard: document.querySelector("#bandSleepCard"),
  bandHeartCard: document.querySelector("#bandHeartCard"),
  bandReadiness: document.querySelector("#bandReadiness"),
  bandLastSession: document.querySelector("#bandLastSession"),
  openBandViewButton: document.querySelector("#openBandViewButton"),
  bandLiveHr: document.querySelector("#bandLiveHr"),
  musicCard: document.querySelector("#musicCard"),
  bandChart: document.querySelector("#bandChart"),
};

function bindKeyboardInset() {
  window.trainySetKeyboardInset = (cssIme) => {
    window.trainyNativeImePx = Math.max(0, Number(cssIme) || 0);
    syncKeyboardInset();
  };
  const viewport = window.visualViewport;
  const sync = () => window.requestAnimationFrame(syncKeyboardInset);
  window.addEventListener("resize", sync);
  window.addEventListener("focusin", sync);
  window.addEventListener("focusout", () => window.setTimeout(sync, 80));
  viewport?.addEventListener("resize", sync);
  viewport?.addEventListener("scroll", sync);
  syncKeyboardInset();
}

function syncKeyboardInset() {
  const focused = Boolean(document.activeElement?.closest?.("input, textarea, select"));
  let open = false;
  if (typeof window.trainyNativeImePx === "number") {
    open = window.trainyNativeImePx > 80 && focused;
    document.documentElement.style.setProperty("--keyboard-inset", "0px");
    document.documentElement.style.setProperty("--vv-height", `${Math.round(window.innerHeight)}px`);
  } else {
    const viewport = window.visualViewport;
    const visible = viewport ? viewport.height : window.innerHeight;
    const offset = viewport ? viewport.offsetTop : 0;
    const inset = Math.max(0, Math.round(window.innerHeight - visible - offset));
    open = inset > 80 && focused;
    document.documentElement.style.setProperty("--keyboard-inset", `${open ? inset : 0}px`);
    document.documentElement.style.setProperty("--vv-height", `${Math.round(visible)}px`);
  }
  document.documentElement.classList.toggle("keyboard-open", open);
  if (elements.aiChatLog?.childElementCount) scrollAiChatToBottom();
}

function boot() {
  requestPersistentStorage();
  renderAccentPicker();
  renderWidgetStylePicker();
  fillExerciseSelects();
  fillBuilderGoals();
  renderMyGym();
  renderWeekdayPicker();
  renderScheduleCalendar();
  loadDayPlans();
  loadPlannedWorkout();
  applyStoredAiPlan();
  discardTestSessionOnce();
  restoreWorkoutDraft();
  bindEvents();
  render();
  window.offlineHistoryReady = loadOfflineHistory();
  initAiCoach();
  initWearable();
  consumeWidgetLaunch();
  bindKeyboardInset();
}

function bindEvents() {
  elements.resetButton.addEventListener("click", () => {
    if (!confirm("Очистить локальный кэш на этом устройстве?")) return;
    state = { workouts: [] };
    saveState();
    localStorage.removeItem(WORKOUT_DRAFT_KEY);
    loadPlannedWorkout();
    render();
  });

  document.querySelector("#openPlanEditor")?.addEventListener("click", openPlanEditor);
  document.querySelector("#closePlanEditor")?.addEventListener("click", closePlanEditor);
  document.querySelector("#planEditorBackdrop")?.addEventListener("click", closePlanEditor);
  document.querySelector("#openExercisePicker")?.addEventListener("click", openExercisePicker);
  document.querySelector("#closeExercisePicker")?.addEventListener("click", closeExercisePicker);
  document.querySelector("#exercisePickerBackdrop")?.addEventListener("click", closeExercisePicker);
  elements.exercisePickList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-exercise-id]");
    if (!button) return;
    const uid = addExercise(button.dataset.exerciseId);
    renderSelectedExercises();
    saveWorkoutDraft();
    closeExercisePicker();
    if (workoutIsLive()) {
      showToast(`Добавлено в конец: ${findExercise(button.dataset.exerciseId).name}`);
      return;
    }
    keepExerciseTitleInView(uid);
  });
  elements.exerciseSearchInput?.addEventListener("input", renderExercisePicker);
  elements.exerciseSearchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.preventDefault();
  });
  elements.buildWorkoutButton?.addEventListener("click", runWorkoutBuilder);

  elements.aiChatSendButton.addEventListener("click", sendAiChatMessage);
  elements.aiChatStopButton?.addEventListener("click", stopAiRun);
  elements.saveAiApiKeyButton?.addEventListener("click", saveAiApiKey);
  elements.saveAiBaseUrlButton?.addEventListener("click", saveAiBaseUrl);
  elements.aiChatClearButton.addEventListener("click", clearAiChat);
  elements.aiChatLog.addEventListener("click", (event) => {
    const planButton = event.target.closest("[data-ai-plan]");
    if (planButton) {
      if (planButton.dataset.aiPlan === "accept") acceptPendingAiPlan();
      else declinePendingAiPlan();
      return;
    }
    if (event.target.closest(".ai-retry-button")) retryAiChat();
  });
  document.querySelectorAll(".ai-quick-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      elements.aiChatInput.value = chip.dataset.question;
      sendAiChatMessage();
    });
  });
  elements.aiChatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !isTouchDevice()) {
      event.preventDefault();
      sendAiChatMessage();
    }
  });
  elements.aiChatInput.addEventListener("focus", syncKeyboardInset);
  elements.gymSelectAllButton?.addEventListener("click", () => {
    exercises.forEach((exercise) => gymSet().add(exercise.id));
    saveMyGym();
    fillExerciseSelects();
    renderMyGym();
  });
  elements.calPrevButton?.addEventListener("click", () => shiftCalendarMonth(-1));
  elements.calNextButton?.addEventListener("click", () => shiftCalendarMonth(1));
  elements.calModeButton?.addEventListener("click", toggleCalendarMode);
  elements.scheduleCalendar?.addEventListener("click", (event) => {
    const monthTile = event.target.closest(".year-month[data-month]");
    if (monthTile) {
      calendarCursor = new Date(calendarCursor.getFullYear(), Number(monthTile.dataset.month), 1);
      toggleCalendarMode();
      return;
    }
    const cell = event.target.closest(".cal-cell[data-date]");
    if (!cell || cell.disabled) return;
    handleCalendarDayTap(cell.dataset.date);
  });
  elements.weekdayPicker?.addEventListener("click", (event) => {
    const chip = event.target.closest(".weekday-chip[data-weekday]");
    if (!chip) return;
    toggleWeekday(Number(chip.dataset.weekday));
  });
  elements.historyList?.addEventListener("click", (event) => {
    const removeButton = event.target.closest('[data-action="delete-workout"]');
    if (removeButton) {
      deleteWorkoutAt(Number(removeButton.dataset.index));
      return;
    }
    if (event.target.closest('[data-action="history-more"]')) {
      historyLimit += HISTORY_PAGE;
      renderHistory();
    }
  });
  elements.dayDetail?.addEventListener("click", (event) => {
    if (event.target.closest(".day-detail-close")) {
      selectedDayIso = null;
      renderDayDetail();
      renderScheduleCalendar();
      return;
    }
    if (event.target.closest('[data-action="backfill"]') && selectedDayIso) {
      startBackfillWorkout(selectedDayIso);
      return;
    }
    const removeButton = event.target.closest('[data-action="delete-workout"]');
    if (removeButton) {
      deleteWorkoutAt(Number(removeButton.dataset.index));
      return;
    }
    if (event.target.closest('[data-action="unplan"]') && selectedDayIso) {
      schedule().delete(selectedDayIso);
      saveSchedule();
      renderDayDetail();
      renderScheduleCalendar();
    }
    if (event.target.closest('[data-action="toggle-plan"]') && selectedDayIso) {
      toggleScheduledDate(selectedDayIso);
      renderDayDetail();
    }
    if (event.target.closest('[data-action="open-plan"]') && selectedDayIso) {
      openDayPlan(selectedDayIso);
    }
  });
  elements.gymFromHistoryButton?.addEventListener("click", () => {
    myGymSet = defaultMyGymIds();
    saveMyGym();
    fillExerciseSelects();
    renderMyGym();
  });
  elements.copyReportButton.addEventListener("click", copyWorkoutReport);
  elements.startWorkoutButton.addEventListener("click", startWorkoutTimer);
  elements.wearableConnectButton?.addEventListener("click", connectWearable);
  elements.wearableRefreshButton?.addEventListener("click", () => refreshWearable(false));
  document.querySelector('[data-view="band"]')?.addEventListener("click", (event) => {
    const action = event.target.closest("[data-band-action]")?.dataset.bandAction;
    if (action === "grant") connectWearable();
    if (action === "settings") openWearableSettings();
  });
  elements.wearableSettingsButton?.addEventListener("click", openWearableSettings);
  elements.openBandViewButton?.addEventListener("click", () => window.showAppView?.("band"));
  window.trainyOpenBandView = () => refreshWearable(true);
  document.querySelector("#bandDiagnosticsButton")?.addEventListener("click", renderBandDiagnostics);
  document.querySelector("#bandDiagnosticsButton")?.closest("details")?.addEventListener("toggle", (event) => {
    if (event.target.open) renderBandDiagnostics();
  });
  elements.bandLastSession?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-band-resync]");
    if (button) resyncWorkoutBand(Number(button.dataset.bandResync));
  });
  document.querySelectorAll("[data-widget-pin]").forEach((button) => {
    button.addEventListener("click", () => pinNativeWidget(button.dataset.widgetPin));
  });
  document.querySelectorAll("[data-widget-style]").forEach((button) => {
    button.addEventListener("click", () => setWidgetStyle(button.dataset.widgetStyle));
  });
  elements.wearableApplyHint?.addEventListener("click", applyWearableReadiness);
  elements.dateInput.addEventListener("change", () => {
    if (workoutIsLive()) {
      saveWorkoutDraft();
      updateNativeWidget();
      return;
    }
    const next = elements.dateInput.value;
    if (editingPlanIso && editingPlanIso !== next) writeDayPlan(editingPlanIso, selected);
    editingPlanIso = next;
    loadDayPlanIntoSelected(next);
    renderSelectedExercises();
    renderCoach();
    updateNativeWidget();
    saveWorkoutDraft();
  });
  elements.readinessInput.addEventListener("change", () => {
    renderCoach();
    saveWorkoutDraft();
  });
  elements.sessionEffortInput.addEventListener("change", saveWorkoutDraft);
  elements.afterNotesInput.addEventListener("input", saveWorkoutDraft);
  document.querySelector("#openRecordsButton")?.addEventListener("click", () => window.showAppView?.("analytics"));
  document.querySelector("#chartExerciseButton")?.addEventListener("click", () => setChartMenu(true));
  document.querySelector("#chartExerciseClose")?.addEventListener("click", () => setChartMenu(false));
  document.querySelector("#chartExerciseDismiss")?.addEventListener("click", () => setChartMenu(false));
  document.querySelector("#chartExerciseList")?.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-chart-exercise]")?.dataset.chartExercise;
    if (!choice) return;
    chartExerciseId = choice;
    setChartMenu(false);
    fillExerciseSelects();
    renderCharts();
  });
  window.addEventListener("pagehide", saveWorkoutDraft);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      saveWorkoutDraft();
      flushAllCloudDeletes();
    } else {
      refreshWearable(true);
      applyLockDones();
    }
  });
  window.addEventListener("pagehide", flushAllCloudDeletes);

  elements.workoutForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isFinishingWorkout) return;
    await applyLockDones();
    if (workoutIsLive()) {
      if (finishArmedUntil < Date.now()) {
        finishArmedUntil = Date.now() + 4000;
        const armed = finishArmedUntil;
        elements.finishWorkoutButton.textContent = "Ещё раз — завершить";
        window.setTimeout(() => {
          if (!isFinishingWorkout && finishArmedUntil === armed) {
            finishArmedUntil = 0;
            elements.finishWorkoutButton.textContent = "Завершить тренировку";
          }
        }, 4100);
        return;
      }
      finishArmedUntil = 0;
    }

    stopWorkoutTimer();
    const workout = collectWorkout();
    if (!workout.exercises.length) {
      alert("Добавь хотя бы одно упражнение.");
      return;
    }
    const resumeDraft = buildWorkoutDraft();
    const band = await attachWearableMetrics(workout);
    if (band) workout.wearable = band;

    isFinishingWorkout = true;
    setFinishButtonState("saving");
    try {
      upsertWorkout(workout);
      state.workouts.sort((a, b) => a.date.localeCompare(b.date));
      saveState();
      localStorage.setItem(
        AI_POST_WORKOUT_PENDING_KEY,
        JSON.stringify({ workoutId: workout.id, workoutDate: workout.date, savedAt: Date.now() })
      );
      if (navigator.vibrate) navigator.vibrate(80);

      lastFinishedWorkout = { workout, draft: resumeDraft };
      const pushedToCloud = await window.cloudSync?.pushWorkout(workout);
      showToast(pushedToCloud ? "Сохранено в облаке ✓" : "Сохранено ✓", "success", {
        actionLabel: "Вернуть",
        onAction: resumeFinishedWorkout,
        duration: 10000,
      });
      try {
        await copyText(buildWorkoutReport(workout));
        elements.copyReportButton.textContent = "Отчет скопирован";
        setTimeout(() => {
          elements.copyReportButton.textContent = "Отчет";
        }, 1800);
      } catch {
        // Saving is more important than clipboard availability.
      }
      clearWorkoutDraft();
      localStorage.removeItem(AI_PLAN_STORAGE);
      workoutSessionUid = makeUid();
      loadPlannedWorkout();
      resetWorkoutTimer();
      render();
      showFinishNotice(workout, pushedToCloud);
      autoAiAfterWorkout();
    } finally {
      isFinishingWorkout = false;
      setFinishButtonState("idle");
    }
  });
}

function render() {
  renderStats();
  renderDashboard();
  renderSelectedExercises();
  renderCoach();
  renderCharts();
  renderHistory();
  renderScheduleCalendar();
  renderBandAnalytics();
  updateNativeWidget();
}

const TITLE_AREAS = {
  Ноги: "ноги",
  Икры: "ноги",
  "Задняя цепь": "ноги",
  Плиометрика: "ноги",
  Спина: "спина",
  Грудь: "грудь",
  Плечи: "плечи",
  Руки: "руки",
  Кор: "кор",
  Функционал: "функционал",
};
const UPPER_AREAS = new Set(["спина", "грудь", "плечи", "руки"]);
const TITLE_ORDER = ["спина", "грудь", "плечи", "руки", "ноги", "функционал", "кор"];

elements.musicCard?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-music]");
  const bridge = musicBridge();
  if (!button || !bridge) return;
  event.preventDefault();
  const action = button.dataset.music;
  try {
    if (action === "access") await bridge.openAccess();
    else if (action === "open") await bridge.openPlayer();
    else if (action === "queue") await bridge.control({ action, id: Number(button.dataset.id) });
    else await bridge.control({ action });
  } catch (error) {
    showToast(error?.message || "Плеер не ответил");
  }
  window.setTimeout(refreshMusic, 600);
});

// Запускаем приложение только после инициализации всех const/let ниже по файлу.
// Иначе ранний boot может попасть в temporal dead zone новых модулей.
boot();
