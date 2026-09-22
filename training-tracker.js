const STORAGE_KEY = "training-tracker-v3";
const WORKOUT_DRAFT_KEY = "training-tracker-active-workout-draft-v1";
const AI_CHAT_STORAGE = "training-tracker-ai-chat-v1";
const AI_PLAN_STORAGE = "training-tracker-ai-plan-v1";
const AI_PENDING_PLAN_KEY = "training-tracker-ai-pending-plan-v1";
const AI_POST_WORKOUT_PENDING_KEY = "training-tracker-ai-post-workout-pending-v1";
const DISCARD_TEST_SESSION_KEY = "training-tracker-discard-test-2026-09-21-b";
const TEST_SESSION_DATE = "2026-09-21";
const CUSTOM_EXERCISES_KEY = "training-tracker-custom-exercises-v1";
const OFFLINE_HISTORY_URL = "./data/workouts.json";
const AI_KEY_STORAGE = "training-tracker-ai-key";
const AI_BASE_STORAGE = "training-tracker-ai-base-url";
const AI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
const AI_MODEL = "gpt-5.6-terra";
// Технические предохранители, чтобы не раздувать запрос до лимитов провайдера
// и не зациклить вызовы инструментов.
const AI_MAX_TOOL_ROUNDS = 12;
const AI_CHAT_HISTORY_LIMIT = 60;

// Каталог упражнений загружается из exercise-catalog.js (генерируется скриптом tools/build-exercise-catalog.py из data/exercise-catalog.json).
const exercises = (window.exerciseCatalog?.exercises || []).map((exercise) => ({ ...exercise }));
const EXERCISE_ALIASES = window.exerciseCatalog?.aliases || {};
const MY_GYM_KEY = "training-tracker-my-gym-v3";
const DEFAULT_MY_GYM = window.exerciseCatalog?.defaultGym || [];

const EXERCISE_GROUPS = ["Ноги", "Икры", "Спина", "Грудь", "Плечи", "Задняя цепь", "Функционал", "Руки", "Кор", "Плиометрика", "Кардио", "Другое"];

exercises.push(
  ...loadCustomExercises().filter(
    (custom) => !EXERCISE_ALIASES[custom.id] && !exercises.some((exercise) => exercise.id === custom.id)
  )
);

function loadCustomExercises() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_EXERCISES_KEY));
    return Array.isArray(saved) ? saved.filter((exercise) => exercise?.id && exercise?.name) : [];
  } catch {
    return [];
  }
}

function slugifyExerciseName(name) {
  const translit = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  const slug = name
    .toLowerCase()
    .split("")
    .map((char) => translit[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || `exercise-${Date.now()}`;
}

function addCustomExercise({ name, group, unit, step }) {
  let id = `custom-${slugifyExerciseName(name)}`;
  while (exercises.some((exercise) => exercise.id === id)) id = `${id}-2`;

  const numericStep = Number(step);
  const exercise = {
    id,
    name: name.trim(),
    group: group && EXERCISE_GROUPS.includes(group) ? group : "Другое",
    unit: (unit || "кг").trim(),
    step: Number.isFinite(numericStep) && numericStep !== 0 ? numericStep : 2.5,
    defaultSets: [[20, 10], [20, 10], [20, 10]],
    custom: true,
  };

  exercises.push(exercise);
  localStorage.setItem(CUSTOM_EXERCISES_KEY, JSON.stringify(loadCustomExercises().concat(exercise)));
  gymSet().add(exercise.id);
  saveMyGym();
  fillExerciseSelects();
  renderMyGym();
  return exercise;
}

// «Мой зал»: набор id упражнений, доступных в зале пользователя. Всё вне набора
// скрыто из выбора и из каталога AI-тренера. По умолчанию — то, что уже встречалось в истории.
let myGymSet = null;

function gymSet() {
  if (myGymSet) return myGymSet;
  try {
    const saved = JSON.parse(localStorage.getItem(MY_GYM_KEY));
    if (Array.isArray(saved)) {
      myGymSet = new Set(saved.map((id) => EXERCISE_ALIASES[id] || id));
      return myGymSet;
    }
  } catch {
    // fallthrough to default
  }
  myGymSet = defaultMyGymIds();
  saveMyGym();
  return myGymSet;
}

function defaultMyGymIds() {
  // Пресет зала из каталога (машины + свободные веса / перекладина / брусья / мячи).
  if (DEFAULT_MY_GYM.length) {
    const preset = new Set(
      DEFAULT_MY_GYM.map((id) => EXERCISE_ALIASES[id] || id).filter((id) =>
        exercises.some((exercise) => exercise.id === id)
      )
    );
    exercises.forEach((exercise) => {
      if (exercise.custom) preset.add(exercise.id);
    });
    return preset;
  }

  const used = new Set();
  const source = state?.workouts || [];
  source.forEach((workout) =>
    (workout.exercises || []).forEach((item) => {
      const resolved = EXERCISE_ALIASES[item.exerciseId] || item.exerciseId;
      if (exercises.some((exercise) => exercise.id === resolved)) used.add(resolved);
    })
  );
  exercises.forEach((exercise) => {
    if (exercise.custom) used.add(exercise.id);
  });
  return used;
}

function saveMyGym() {
  localStorage.setItem(MY_GYM_KEY, JSON.stringify([...gymSet()]));
}

function isExerciseAvailable(exercise) {
  return exercise.custom || gymSet().has(exercise.id);
}

function renderMyGym() {
  if (!elements.gymList) return;
  const set = gymSet();
  const groups = EXERCISE_GROUPS.filter((group) => exercises.some((exercise) => exercise.group === group));
  elements.gymList.innerHTML = groups
    .map((group) => {
      const items = exercises.filter((exercise) => exercise.group === group);
      const rows = items
        .map(
          (exercise) => `
        <label class="gym-item">
          <input type="checkbox" data-gym-id="${exercise.id}" ${isExerciseAvailable(exercise) ? "checked" : ""} ${exercise.custom ? "disabled" : ""} />
          <span>${escapeHtml(exercise.name)}</span>
        </label>`
        )
        .join("");
      return `<div class="gym-group"><h4>${group}</h4>${rows}</div>`;
    })
    .join("");

  elements.gymList.querySelectorAll("input[data-gym-id]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) set.add(input.dataset.gymId);
      else set.delete(input.dataset.gymId);
      saveMyGym();
      fillExerciseSelects();
      updateGymStatus();
    });
  });
  updateGymStatus();
}

function updateGymStatus() {
  if (!elements.gymStatus) return;
  const count = exercises.filter((exercise) => isExerciseAvailable(exercise)).length;
  elements.gymStatus.textContent = `${count} из ${exercises.length} отмечено — выбор и AI работают только с этим набором.`;
  updateCabinetStatus();
}

function updateCabinetStatus() {
  if (!elements.cabinetStatus) return;
  const gymCount = exercises.filter((exercise) => isExerciseAvailable(exercise)).length;
  const parts = [
    `Зал ${gymCount}`,
    window.cloudSync?.isAuthenticated?.() ? "облако" : "личное устройство",
    getAiApiKey() || window.cloudSync?.isReady?.() ? "AI без лимитов" : "AI: нужен ключ",
  ];
  elements.cabinetStatus.textContent = parts.join(" · ");
}

// ── Календарь тренировок: даты планирует пользователь ──────────────
const SCHEDULE_KEY = "training-tracker-schedule-v1";
const WEEKDAYS_KEY = "training-tracker-weekdays-v1";
const SCHEDULE_EXCLUDE_KEY = "training-tracker-schedule-exclude-v1";
const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
let scheduleSet = null;
let weekdaySetCache = null;
let excludeSetCache = null;
let calendarCursor = new Date();
let calendarMode = "month";

function loadStoredSet(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

function schedule() {
  if (!scheduleSet) scheduleSet = loadStoredSet(SCHEDULE_KEY);
  return scheduleSet;
}

function weekdays() {
  if (!weekdaySetCache) weekdaySetCache = loadStoredSet(WEEKDAYS_KEY);
  return weekdaySetCache;
}

function excludeSet() {
  if (!excludeSetCache) excludeSetCache = loadStoredSet(SCHEDULE_EXCLUDE_KEY);
  return excludeSetCache;
}

function saveSchedule() {
  // Храним только последние 90 дней прошлого и всё будущее.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffIso = formatInputDate(cutoff);

  const keep = [...schedule()].filter((date) => date >= cutoffIso);
  scheduleSet = new Set(keep);
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(keep.sort()));

  const keepExcluded = [...excludeSet()].filter((date) => date >= cutoffIso);
  excludeSetCache = new Set(keepExcluded);
  localStorage.setItem(SCHEDULE_EXCLUDE_KEY, JSON.stringify(keepExcluded.sort()));

  localStorage.setItem(WEEKDAYS_KEY, JSON.stringify([...weekdays()].sort()));
}

function weekdayIndex(iso) {
  return (new Date(iso).getDay() + 6) % 7; // 0 = понедельник
}

function isPlannedDate(iso) {
  if (excludeSet().has(iso)) return false;
  if (schedule().has(iso)) return true;
  const today = formatInputDate(new Date());
  return iso >= today && weekdays().has(weekdayIndex(iso));
}

function nextScheduledDate() {
  const start = new Date();
  for (let i = 0; i < 60; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const iso = formatInputDate(date);
    if (isPlannedDate(iso)) return iso;
  }
  return null;
}

function workoutDateSet() {
  const dates = new Set();
  (state?.workouts || []).forEach((workout) => dates.add(workout.date));
  return dates;
}

function workoutsOnDate(iso) {
  return (state?.workouts || []).filter((workout) => workout.date === iso);
}

function mondayOf(date) {
  const day = new Date(date);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return formatInputDate(day);
}

function weeklyStreak(dates) {
  const weeks = new Set([...dates].map((iso) => mondayOf(new Date(iso))));
  const cursor = new Date();
  // Текущая неделя ещё идёт: если в ней нет тренировки, серия не рвётся — считаем с прошлой.
  if (!weeks.has(mondayOf(cursor))) cursor.setDate(cursor.getDate() - 7);
  let streak = 0;
  while (weeks.has(mondayOf(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

function renderCalendarStats() {
  if (!elements.calendarStats) return;
  const dates = workoutDateSet();
  const today = formatInputDate(new Date());
  const monthKey = today.slice(0, 7);

  const streak = weeklyStreak(dates);
  const lastDate = [...dates].sort().pop();
  const restDays = lastDate ? Math.max(0, Math.round((new Date(today) - new Date(lastDate)) / 86400000)) : null;
  const monthDone = [...dates].filter((iso) => iso.startsWith(monthKey)).length;
  const daysInMonth = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0).getDate();
  let monthPlanned = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${monthKey}-${String(day).padStart(2, "0")}`;
    if (iso >= today && !dates.has(iso) && isPlannedDate(iso)) monthPlanned += 1;
  }

  elements.calendarStats.innerHTML = `
    <div class="cal-stat"><strong>${streak}</strong><span>${plural(streak, "неделя", "недели", "недель")} подряд</span></div>
    <div class="cal-stat"><strong>${restDays === null ? "—" : restDays}</strong><span>${restDays === 1 ? "день" : plural(restDays || 0, "день", "дня", "дней")} отдыха</span></div>
    <div class="cal-stat"><strong>${monthDone}</strong><span>в этом месяце${monthPlanned ? ` · +${monthPlanned} в плане` : ""}</span></div>
  `;
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

let selectedDayIso = null;

function handleCalendarDayTap(iso) {
  const today = formatInputDate(new Date());

  // День с тренировкой или прошедший день: показываем детали (для прошлого — с дологированием).
  if (workoutDateSet().has(iso) || iso < today) {
    selectedDayIso = selectedDayIso === iso ? null : iso;
    renderDayDetail();
    renderScheduleCalendar();
    return;
  }

  toggleScheduledDate(iso);
}

function startBackfillWorkout(iso) {
  elements.dateInput.value = iso;
  selectedDayIso = null;
  renderDayDetail();
  renderScheduleCalendar();
  window.showAppView?.("workout");
  showToast(`Дата ${formatDate(iso)} подставлена — начни тренировку и внеси, что помнишь.`);
}

function renderDayDetail() {
  const box = elements.dayDetail;
  if (!box) return;

  if (!selectedDayIso) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }

  const workouts = workoutsOnDate(selectedDayIso);
  if (!workouts.length) {
    const today = formatInputDate(new Date());
    if (selectedDayIso >= today) {
      selectedDayIso = null;
      box.hidden = true;
      return;
    }
    // Пустой прошедший день: предложить внести тренировку по памяти.
    const wasPlanned = schedule().has(selectedDayIso) && !excludeSet().has(selectedDayIso);
    box.hidden = false;
    box.innerHTML = `
      <article class="day-detail-card">
        <div class="day-detail-head">
          <strong>${formatDate(selectedDayIso)}</strong>
          <button class="icon-button day-detail-close" type="button" aria-label="Закрыть">×</button>
        </div>
        <p class="day-detail-note">${wasPlanned ? "Тренировка была запланирована, но не записана." : "Тренировки в этот день не записано."}</p>
        <div class="day-detail-actions">
          <button class="button secondary" type="button" data-action="backfill">Внести по памяти</button>
          ${wasPlanned ? '<button class="button ghost" type="button" data-action="unplan">Снять отметку плана</button>' : ""}
        </div>
      </article>
    `;
    return;
  }

  box.hidden = false;
  box.innerHTML = workouts.map((workout) => {
    const meta = [
      readinessLabel(workout.readiness),
      `${doneSetCount(workout)}/${workoutSetCount(workout)} подходов`,
      `RPE ${averageWorkoutRpe(workout) || "n/a"}`,
      workout.durationMinutes ? `${workout.durationMinutes} мин` : null,
      workout.sessionEffort ? sessionEffortLabel(workout.sessionEffort) : null,
      workout.wearable?.sessionTypeLabel || (workout.wearable?.hrAvg ? `пульс ${workout.wearable.hrAvg}` : null),
      workout.wearable?.calories ? `${workout.wearable.calories} ккал` : null,
    ].filter(Boolean).map((part) => `<span>${part}</span>`).join("");

    const exercisesHtml = (workout.exercises || []).map((item) => {
      const exercise = findExercise(item.exerciseId);
      const sets = (item.sets || [])
        .map((set) => `${formatNumber(set.weight)}×${set.reps}${set.rpe ? `<em>@${set.rpe}</em>` : ""}${set.done === false ? " ✗" : ""}`)
        .join(", ");
      return `<li><strong>${escapeHtml(exercise ? exercise.name : item.exerciseId)}</strong><span>${sets}</span></li>`;
    }).join("");

    return `
      <article class="day-detail-card">
        <div class="day-detail-head">
          <strong>${formatDate(workout.date)}</strong>
          <button class="icon-button day-detail-close" type="button" aria-label="Закрыть">×</button>
        </div>
        <div class="day-detail-meta">${meta}</div>
        ${workout.notes ? `<p class="day-detail-note">${escapeHtml(workout.notes)}</p>` : ""}
        ${workout.afterNotes ? `<p class="day-detail-note after">«${escapeHtml(workout.afterNotes)}»</p>` : ""}
        ${wearableCardHtml(workout.wearable)}
        <ul class="day-detail-exercises">${exercisesHtml}</ul>
        <div class="day-detail-actions">
          <button class="button ghost danger-action" type="button" data-action="delete-workout" data-index="${state.workouts.indexOf(workout)}">Удалить тренировку</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderScheduleCalendar() {
  if (!elements.scheduleCalendar) return;
  elements.scheduleCalendar.classList.toggle("year-mode", calendarMode === "year");

  if (calendarMode === "year") {
    renderYearCalendar();
    renderCalendarStats();
    return;
  }

  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const today = formatInputDate(new Date());
  const done = workoutDateSet();

  elements.calTitle.textContent = calendarCursor.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // неделя с понедельника
  const gridStart = new Date(year, month, 1 - startOffset);

  const cells = WEEKDAY_LABELS.map((day) => `<span class="cal-weekday">${day}</span>`);

  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    const iso = formatInputDate(date);
    const inMonth = date.getMonth() === month;
    const isDone = done.has(iso);
    // В прошлом «запланировано» — только ручные отметки; повторяющиеся дни живут от сегодня и дальше.
    const isPlanned = iso >= today ? isPlannedDate(iso) : schedule().has(iso) && !excludeSet().has(iso);
    const classes = ["cal-cell"];
    if (!inMonth) classes.push("is-out");
    if (iso === today) classes.push("is-today");
    if (iso === selectedDayIso) classes.push("is-selected");
    if (isDone) classes.push("is-done");
    else if (isPlanned) classes.push(iso < today ? "is-missed" : "is-planned");
    cells.push(
      `<button type="button" class="${classes.join(" ")}" data-date="${iso}" ${inMonth ? "" : "disabled"} aria-label="${iso}">${date.getDate()}</button>`
    );
  }

  elements.scheduleCalendar.innerHTML = cells.join("");
  renderCalendarStats();
}

function renderYearCalendar() {
  const year = calendarCursor.getFullYear();
  const today = formatInputDate(new Date());
  const done = workoutDateSet();

  elements.calTitle.textContent = String(year);

  const monthFormatter = new Intl.DateTimeFormat("ru-RU", { month: "short" });
  const months = [];

  for (let month = 0; month < 12; month++) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const doneCount = [];
    const dots = [];

    for (let i = 0; i < startOffset; i++) dots.push('<i class="year-dot is-empty"></i>');
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = formatInputDate(new Date(year, month, day));
      const classes = ["year-dot"];
      if (done.has(iso)) {
        classes.push("is-done");
        doneCount.push(iso);
      } else if (iso >= today && isPlannedDate(iso)) {
        classes.push("is-planned");
      }
      if (iso === today) classes.push("is-today");
      dots.push(`<i class="${classes.join(" ")}"></i>`);
    }

    months.push(`
      <button type="button" class="year-month" data-month="${month}" aria-label="${monthFormatter.format(new Date(year, month, 1))} ${year}">
        <span class="year-month-name">${monthFormatter.format(new Date(year, month, 1))}${doneCount.length ? ` · ${doneCount.length}` : ""}</span>
        <span class="year-dots">${dots.join("")}</span>
      </button>
    `);
  }

  elements.scheduleCalendar.innerHTML = `<div class="year-grid">${months.join("")}</div>`;
}

function toggleScheduledDate(iso) {
  if (isPlannedDate(iso)) {
    // Снять план: ручную отметку удаляем, повторяющийся день — исключаем точечно.
    if (schedule().has(iso)) schedule().delete(iso);
    else excludeSet().add(iso);
  } else {
    excludeSet().delete(iso);
    if (!weekdays().has(weekdayIndex(iso))) schedule().add(iso);
  }
  saveSchedule();
  syncScheduleDependents();
}

function syncScheduleDependents() {
  renderScheduleCalendar();
  // Дата в форме и рекомендации следуют за календарём, пока тренировка не начата.
  if (!elements.workoutPanel.classList.contains("is-active")) {
    elements.dateInput.value = nextPlannedWorkoutDate();
  }
  renderCoach();
}

function toggleWeekday(index) {
  if (weekdays().has(index)) weekdays().delete(index);
  else weekdays().add(index);
  saveSchedule();
  renderWeekdayPicker();
  syncScheduleDependents();
}

function renderWeekdayPicker() {
  if (!elements.weekdayPicker) return;
  elements.weekdayPicker.innerHTML = WEEKDAY_LABELS.map((label, index) =>
    `<button type="button" class="weekday-chip${weekdays().has(index) ? " is-on" : ""}" data-weekday="${index}" aria-pressed="${weekdays().has(index)}">${label}</button>`
  ).join("");
}

function shiftCalendarMonth(delta) {
  if (calendarMode === "year") {
    calendarCursor = new Date(calendarCursor.getFullYear() + delta, calendarCursor.getMonth(), 1);
  } else {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + delta, 1);
  }
  renderScheduleCalendar();
}

function toggleCalendarMode() {
  calendarMode = calendarMode === "month" ? "year" : "month";
  if (elements.calModeButton) {
    elements.calModeButton.textContent = calendarMode === "month" ? "Год" : "Месяц";
  }
  renderScheduleCalendar();
}

let state = loadState();
let selected = [];
let isFinishingWorkout = false;
// Стабильный id на сессию: повторное "Завершить" перезапишет запись, а не создаст дубль.
let workoutSessionUid = makeUid();
let aiChat = loadAiChat();
let workoutTimer = {
  startedAt: null,
  stoppedAt: null,
  intervalId: null,
};
let liveBandHrTimer = null;

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
  exerciseSelect: document.querySelector("#exerciseSelect"),
  addExerciseButton: document.querySelector("#addExerciseButton"),
  copyReportButton: document.querySelector("#copyReportButton"),
  selectedExercises: document.querySelector("#selectedExercises"),
  exerciseTemplate: document.querySelector("#exerciseTemplate"),
  coachBox: document.querySelector("#coachBox"),
  aiChatLog: document.querySelector("#aiChatLog"),
  aiChatInput: document.querySelector("#aiChatInput"),
  aiChatSendButton: document.querySelector("#aiChatSendButton"),
  aiChatClearButton: document.querySelector("#aiChatClearButton"),
  aiStatus: document.querySelector("#aiStatus"),
  aiApiKeyInput: document.querySelector("#aiApiKeyInput"),
  saveAiApiKeyButton: document.querySelector("#saveAiApiKeyButton"),
  aiBaseUrlInput: document.querySelector("#aiBaseUrlInput"),
  saveAiBaseUrlButton: document.querySelector("#saveAiBaseUrlButton"),
  readinessPill: document.querySelector("#readinessPill"),
  prBoard: document.querySelector("#prBoard"),
  chartExerciseSelect: document.querySelector("#chartExerciseSelect"),
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
  bandLastSession: document.querySelector("#bandLastSession"),
  openBandViewButton: document.querySelector("#openBandViewButton"),
  bandLiveHr: document.querySelector("#bandLiveHr"),
  bandChart: document.querySelector("#bandChart"),
};

const ACCENT_KEY = "training-tracker-accent";
const WIDGET_STYLE_KEY = "training-tracker-widget-style";
const ACCENT_COLORS = [
  { id: "lime", color: "#c8f135", label: "Лайм" },
  { id: "cyan", color: "#2fd3f0", label: "Циан" },
  { id: "coral", color: "#ff5a5f", label: "Коралл" },
  { id: "violet", color: "#a78bfa", label: "Фиолет" },
  { id: "amber", color: "#ffb454", label: "Янтарь" },
];

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

function currentAccent() {
  const saved = localStorage.getItem(ACCENT_KEY);
  return ACCENT_COLORS.some((accent) => accent.id === saved) ? saved : "lime";
}

function applyAccent(accentId) {
  if (accentId === "lime") {
    delete document.documentElement.dataset.accent;
  } else {
    document.documentElement.dataset.accent = accentId;
  }
  localStorage.setItem(ACCENT_KEY, accentId);
  renderAccentPicker();
  updateNativeWidget();
}

function currentWidgetStyle() {
  return localStorage.getItem(WIDGET_STYLE_KEY) === "glass" ? "glass" : "solid";
}

function setWidgetStyle(style) {
  localStorage.setItem(WIDGET_STYLE_KEY, style === "glass" ? "glass" : "solid");
  renderWidgetStylePicker();
  updateNativeWidget();
  showToast(style === "glass" ? "Виджеты стали прозрачными" : "Виджеты с плотным фоном");
}

function renderWidgetStylePicker() {
  const active = currentWidgetStyle();
  document.querySelectorAll("[data-widget-style]").forEach((button) => {
    const isActive = button.dataset.widgetStyle === active;
    button.classList.toggle("secondary", isActive);
    button.classList.toggle("ghost", !isActive);
    button.setAttribute("aria-checked", String(isActive));
  });
}

function renderAccentPicker() {
  if (!elements.accentPicker) return;
  const active = currentAccent();
  elements.accentPicker.innerHTML = "";
  ACCENT_COLORS.forEach((accent) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = `accent-dot${accent.id === active ? " is-active" : ""}`;
    dot.style.background = accent.color;
    dot.title = accent.label;
    dot.setAttribute("role", "radio");
    dot.setAttribute("aria-checked", String(accent.id === active));
    dot.setAttribute("aria-label", `Акцент: ${accent.label}`);
    dot.addEventListener("click", () => applyAccent(accent.id));
    elements.accentPicker.append(dot);
  });
}

async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return;

  try {
    await navigator.storage.persist();
  } catch {
    // Storage persistence is a best-effort browser hint.
  }
}

function entry(exerciseId, rows) {
  return {
    exerciseId,
    sets: rows.map(([weight, reps, rpe]) => ({ weight, reps, rpe })),
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    // Офлайн-история подгружается в boot().
    return { version: 3, workouts: [] };
  }

  try {
    const parsed = JSON.parse(raw);
    const saved = Array.isArray(parsed.workouts) ? parsed.workouts : [];
    return { version: 3, workouts: normalizeWorkoutDates(saved) };
  } catch {
    return { version: 3, workouts: [] };
  }
}

async function loadOfflineHistory() {
  if (localStorage.getItem(STORAGE_KEY)) return;

  try {
    const response = await fetch(OFFLINE_HISTORY_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data?.workouts)) throw new Error("Некорректный формат истории");

    // Пока история загружалась, пользователь мог уже начать создавать данные.
    if (localStorage.getItem(STORAGE_KEY)) return;

    state = { version: 3, workouts: normalizeWorkoutDates(data.workouts) };
    saveState();
    render();
  } catch (error) {
    console.warn("Не удалось загрузить офлайн-историю:", error);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, workouts: state.workouts }));
}

function isTestSession(workout) {
  if (!workout) return false;
  return workout.date === TEST_SESSION_DATE || String(workout.id || "").startsWith(`manual-${TEST_SESSION_DATE}`);
}

function discardTestSessionOnce() {
  if (localStorage.getItem(DISCARD_TEST_SESSION_KEY)) return;
  localStorage.setItem(DISCARD_TEST_SESSION_KEY, "1");

  const hadDraft = Boolean(localStorage.getItem(WORKOUT_DRAFT_KEY));
  localStorage.removeItem(WORKOUT_DRAFT_KEY);
  localStorage.removeItem(AI_POST_WORKOUT_PENDING_KEY);

  const removed = (state.workouts || []).filter(isTestSession);
  if (removed.length) {
    const removedIds = new Set(removed.map((workout) => workout.id).filter(Boolean));
    state.workouts = state.workouts.filter((workout) => !isTestSession(workout) && !removedIds.has(workout.id));
    saveState();
    const dropCloud = () => removed.forEach((workout) => window.cloudSync?.deleteWorkout?.(workout));
    dropCloud();
    setTimeout(dropCloud, 1500);
  }

  if (hadDraft || removed.length) showToast("Тестовая тренировка удалена");
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

  elements.addExerciseButton.addEventListener("click", () => {
    const uid = addExercise(elements.exerciseSelect.value);
    renderSelectedExercises();
    saveWorkoutDraft();
    keepExerciseTitleInView(uid);
  });
  elements.buildWorkoutButton?.addEventListener("click", runWorkoutBuilder);

  elements.aiChatSendButton.addEventListener("click", sendAiChatMessage);
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
  elements.wearableRefreshButton?.addEventListener("click", refreshWearable);
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
  elements.dateInput.addEventListener("change", saveWorkoutDraft);
  elements.readinessInput.addEventListener("change", () => {
    renderCoach();
    saveWorkoutDraft();
  });
  elements.sessionEffortInput.addEventListener("change", saveWorkoutDraft);
  elements.afterNotesInput.addEventListener("input", saveWorkoutDraft);
  elements.chartExerciseSelect.addEventListener("change", renderCharts);
  window.addEventListener("pagehide", saveWorkoutDraft);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveWorkoutDraft();
    else refreshWearable(true);
  });

  elements.workoutForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isFinishingWorkout) return;

    stopWorkoutTimer();
    const workout = collectWorkout();
    if (!workout.exercises.length) {
      alert("Добавь хотя бы одно упражнение.");
      return;
    }
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

      const pushedToCloud = await window.cloudSync?.pushWorkout(workout);
      showToast(pushedToCloud ? "Сохранено в облаке ✓" : "Сохранено ✓");
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

async function nudgeBandWorkout(phase) {
  const box = document.querySelector("#bandNudge");
  const api = window.TrainyWearable;
  if (phase === "stop") {
    if (box) box.hidden = true;
    await api?.stopBandWorkout?.();
    return;
  }
  if (!api?.isNative?.()) {
    if (box) box.hidden = true;
    return;
  }
  try {
    await api.startBandWorkout();
    if (box) box.hidden = false;
  } catch {
    if (box) box.hidden = true;
  }
}

function startWorkoutTimer() {
  if (workoutTimer.startedAt) return;

  hideFinishNotice();
  elements.workoutPanel.classList.add("is-active");
  workoutTimer = {
    startedAt: Date.now(),
    stoppedAt: null,
    intervalId: window.setInterval(renderWorkoutTimer, 1000),
  };
  renderWorkoutTimer();
  saveWorkoutDraft();
  updateNativeWidget();
  nudgeBandWorkout("start");
  startLiveBandHr();
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
  const nudge = document.querySelector("#bandNudge");
  if (nudge) nudge.hidden = true;
  stopLiveBandHr();
  if (elements.bandLiveHr) {
    elements.bandLiveHr.hidden = true;
    elements.bandLiveHr.textContent = "";
  }
  updateNativeWidget();
}

function saveWorkoutDraft() {
  const hasStarted = Boolean(workoutTimer.startedAt);
  const hasChanges = selected.some((item) =>
    item.sets.some((set) => set.done || set.rpe || set.mark !== "normal")
  ) || Boolean(elements.afterNotesInput.value.trim());

  if (!hasStarted && !hasChanges) return;

  const draft = {
    version: 1,
    savedAt: Date.now(),
    sessionUid: workoutSessionUid,
    isActive: elements.workoutPanel.classList.contains("is-active"),
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
    selected,
  };

  localStorage.setItem(WORKOUT_DRAFT_KEY, JSON.stringify(draft));
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

function showToast(message, tone = "success") {
  let container = document.querySelector("#toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${tone}`;
  toast.setAttribute("role", "status");
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 350);
  }, 2800);
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
  `;
  elements.finishNotice.scrollIntoView({ behavior: "smooth", block: "start" });
}

function hideFinishNotice() {
  elements.finishNotice.hidden = true;
  elements.finishNotice.innerHTML = "";
}

function deleteWorkoutAt(index) {
  const workout = state.workouts[index];
  if (!workout) return;
  if (!confirm(`Удалить тренировку ${formatDate(workout.date)}?`)) return;

  state.workouts.splice(index, 1);
  saveState();
  window.cloudSync?.deleteWorkout?.(workout);
  if (!workoutsOnDate(workout.date).length) selectedDayIso = null;
  render();
  renderDayDetail();
  showToast("Тренировка удалена");
}

function upsertWorkout(workout) {
  const key = workout.id || `${workout.date}-${workout.notes || ""}`;
  state.workouts = state.workouts.filter((item) => (item.id || `${item.date}-${item.notes || ""}`) !== key);
  state.workouts.push(workout);
}

function fillExerciseSelects() {
  const optionFor = (exercise) => `<option value="${exercise.id}">${exercise.name}</option>`;
  const available = exercises.filter((exercise) => isExerciseAvailable(exercise));
  const pickList = available.length ? available : exercises;
  const previousChartChoice = elements.chartExerciseSelect.value;
  elements.exerciseSelect.innerHTML = pickList.map(optionFor).join("");

  // В «Прогрессе» показываем только упражнения, по которым есть история.
  const doneIds = new Set();
  state.workouts.forEach((workout) =>
    (workout.exercises || []).forEach((item) => doneIds.add(item.exerciseId))
  );
  const chartList = exercises.filter((exercise) => doneIds.has(exercise.id));
  const chartPick = chartList.length ? chartList : exercises;
  elements.chartExerciseSelect.innerHTML = chartPick.map(optionFor).join("");
  elements.chartExerciseSelect.value = chartPick.some((exercise) => exercise.id === previousChartChoice)
    ? previousChartChoice
    : (chartPick.find((exercise) => exercise.id === "bench") || chartPick[0])?.id || "";
}

function mergeWorkouts(current, incoming) {
  current = normalizeWorkoutDates(current);
  incoming = normalizeWorkoutDates(incoming);
  const keyFor = (workout) => workout.id || `${workout.date}-${workout.notes || ""}`;
  const byDate = new Map(current.map((workout) => [keyFor(workout), workout]));
  incoming.forEach((workout) => byDate.set(keyFor(workout), workout));
  return removeFutureCompletedWorkouts(
    removeRepeatedSaveDuplicates(removePlaceholderDuplicateWorkouts([...byDate.values()]))
  ).sort((a, b) => a.date.localeCompare(b.date));
}

// Многократное нажатие "Завершить" раньше плодило одинаковые записи с разными id — схлопываем их.
function removeRepeatedSaveDuplicates(workouts) {
  const byPayload = new Map();
  workouts.forEach((workout) => {
    const key = JSON.stringify({
      date: workout.date,
      notes: workout.notes || "",
      afterNotes: workout.afterNotes || "",
      sessionEffort: workout.sessionEffort || null,
      exercises: (workout.exercises || []).map((item) => ({
        exerciseId: item.exerciseId,
        sets: (item.sets || []).map((set) => [set.weight, set.reps, set.rpe ?? null, set.done === true]),
      })),
    });
    const existing = byPayload.get(key);
    if (!existing || (workout.durationMinutes || 0) >= (existing.durationMinutes || 0)) {
      byPayload.set(key, workout);
    }
  });
  return [...byPayload.values()];
}

function removePlaceholderDuplicateWorkouts(workouts) {
  const hasSavedWorkoutByDate = new Set(
    workouts
      .filter((workout) => workout.sessionEffort || workout.durationMinutes || explicitDoneSetCount(workout) > 0)
      .map((workout) => workout.date)
  );

  return workouts.filter((workout) => {
    if (!hasSavedWorkoutByDate.has(workout.date)) return true;
    return workout.sessionEffort || workout.durationMinutes || explicitDoneSetCount(workout) > 0;
  });
}

function explicitDoneSetCount(workout) {
  return (workout.exercises || []).reduce(
    (sum, exercise) => sum + (exercise.sets || []).filter((set) => set.done === true).length,
    0
  );
}

function normalizeWorkoutDates(workouts) {
  const dateFixes = {
    "2026-06-26": "2026-06-23",
    "2026-07-03": "2026-06-30",
  };

  return workouts.map((workout) => {
    const fixedDate = dateFixes[workout.date];
    const hasAliasedIds = (workout.exercises || []).some((item) => EXERCISE_ALIASES[item.exerciseId]);
    if (!fixedDate && !hasAliasedIds) return workout;

    const fixed = { ...workout };
    if (hasAliasedIds) {
      fixed.exercises = workout.exercises.map((item) =>
        EXERCISE_ALIASES[item.exerciseId] ? { ...item, exerciseId: EXERCISE_ALIASES[item.exerciseId] } : item
      );
    }
    if (fixedDate) {
      fixed.date = fixedDate;
      if (typeof fixed.id === "string") {
        fixed.id = fixed.id.replace(/^manual-\d{4}-\d{2}-\d{2}-/, `manual-${fixedDate}-`);
      }
    }
    return fixed;
  });
}

function removeFutureCompletedWorkouts(workouts) {
  const today = formatInputDate(new Date());
  return workouts.filter((workout) => !workout.date || workout.date <= today);
}

function addExercise(exerciseId) {
  const exercise = findExercise(exerciseId);
  const working = pickWorkingLoad(exercise);
  const intensity = currentWorkoutIntensity();
  const uid = makeUid();
  const intensityLabel = { light: "лайт", normal: "рабочий", heavy: "чуть выше" }[intensity];
  selected.push({
    uid,
    exerciseId,
    sourceNote: working
      ? `база ${formatNumber(scaleWorkingWeight(working.weight, exercise, intensity))} · ${intensityLabel}`
      : "нет истории, шаблон",
    sets: suggestedSetsForExercise(exercise).map(([weight, reps]) => ({
      weight,
      reps,
      rpe: "",
      done: false,
      mark: "normal",
    })),
  });
  return uid;
}

function currentWorkoutIntensity() {
  const readiness = elements.readinessInput?.value || "okay";
  const notes = `${elements.notesInput?.value || ""}`.toLowerCase();
  if (readiness === "bad") return "light";
  if (readiness === "good") return "heavy";
  if (/лайт|восстанов|recovery|легк/.test(notes)) return "light";
  return "normal";
}

function roundToStep(value, step) {
  const abs = Math.abs(Number(step) || 0.5);
  const rounded = Math.round(Number(value) / abs) * abs;
  return Number(rounded.toFixed(3));
}

function median(values) {
  const sorted = values.map(Number).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function recentExerciseSessions(exerciseId, limit = 3) {
  const sessions = [];
  for (let index = state.workouts.length - 1; index >= 0; index -= 1) {
    const workout = state.workouts[index];
    const entry = (workout.exercises || []).find((item) => item.exerciseId === exerciseId);
    if (!entry) continue;
    const sets = (entry.sets || []).filter((set) => set.mark !== "skip" && Number(set.reps) > 0);
    if (!sets.length) continue;
    sessions.push(sets);
    if (sessions.length >= limit) break;
  }
  return sessions;
}

function workingSetsFromSession(sets, exercise) {
  const usable = sets.filter((set) => {
    if (exercise.cardio) return Number(set.weight) > 0 || Number(set.reps) > 0;
    if (exercise.bodyweight) return Number(set.reps) > 0;
    return Number(set.weight) > 0;
  });
  if (!usable.length) return [];

  let quality = usable.filter((set) => {
    const rpe = Number(set.rpe);
    const reps = Number(set.reps);
    const hasRpe = Number.isFinite(rpe) && rpe > 0;
    if (hasRpe && (rpe < 6.5 || rpe > 8.5)) return false;
    if (!exercise.cardio && !exercise.bodyweight && reps < 6) return false;
    return true;
  });
  if (!quality.length) quality = usable;

  if (quality.length >= 2 && !exercise.lowerIsBetter && !exercise.cardio) {
    const maxWeight = Math.max(...quality.map((set) => Number(set.weight)));
    const clustered = quality.filter((set) => Number(set.weight) >= maxWeight * 0.85);
    if (clustered.length) quality = clustered;
  }

  return quality;
}

function pickWorkingLoad(exercise) {
  const sessions = recentExerciseSessions(exercise.id);
  if (!sessions.length) return null;

  const lastWork = workingSetsFromSession(sessions[0], exercise);
  const chosen = lastWork.length
    ? lastWork
    : sessions.slice(1).flatMap((sets) => workingSetsFromSession(sets, exercise));
  if (!chosen.length) return null;

  const weight = median(chosen.map((set) => Number(set.weight)));
  const reps = median(chosen.map((set) => Number(set.reps)));
  return {
    weight,
    reps: Math.max(1, Math.round(reps || 8)),
    setCount: Math.min(4, Math.max(2, sessions[0].length || 3)),
  };
}

function scaleWorkingWeight(weight, exercise, intensity) {
  const step = Math.abs(exercise.step || 2.5);
  const harder = exercise.lowerIsBetter ? -1 : 1;
  if (intensity === "light") return roundToStep(weight - harder * step, step);
  if (intensity === "heavy") return roundToStep(weight + harder * step, step);
  return roundToStep(weight, step);
}

function suggestedSetsForExercise(exercise) {
  const working = pickWorkingLoad(exercise);
  if (!working) return exercise.defaultSets.slice();

  const intensity = currentWorkoutIntensity();
  const workWeight = scaleWorkingWeight(working.weight, exercise, intensity);
  const warmupWeight = scaleWorkingWeight(workWeight, exercise, "light");
  const workReps = working.reps;
  const setCount = working.setCount;

  if (exercise.cardio) {
    return [[Math.max(1, workWeight), 1]];
  }

  if (exercise.bodyweight && Number(exercise.defaultSets?.[0]?.[0]) === 0) {
    const reps = intensity === "light" ? Math.max(1, workReps - 2) : intensity === "heavy" ? workReps + 2 : workReps;
    return Array.from({ length: setCount }, () => [0, reps]);
  }

  if (setCount >= 3) {
    return [[warmupWeight, Math.max(workReps, 8)], ...Array.from({ length: setCount - 1 }, () => [workWeight, workReps])];
  }

  return Array.from({ length: setCount }, () => [workWeight, workReps]);
}

// План следующей тренировки не прошит в код: его собирает пользователь
// конструктором, AI-тренер (set_planned_workout) или он восстанавливается из черновика.
function loadPlannedWorkout() {
  elements.dateInput.value = nextPlannedWorkoutDate();
  elements.readinessInput.value = "okay";
  elements.notesInput.value = "";
  elements.sessionEffortInput.value = "normal";
  elements.afterNotesInput.value = "";
  selected = [];
}

function planEntry(exerciseId, rows) {
  return {
    uid: makeUid(),
    exerciseId,
    sets: rows.map(([weight, reps, rpe]) => ({ weight, reps, rpe, done: false, mark: "normal" })),
  };
}

// Конструктор тренировки по цели: собирает план из упражнений «Моего зала»
// с весами из истории (suggestedSetsForExercise) и ротацией против прошлых сессий.
const WORKOUT_GOALS = [
  { id: "legs-glutes", label: "Ноги и ягодицы", muscles: ["glutes", "quads", "hamstrings", "calves"] },
  { id: "back-biceps", label: "Спина и бицепс", muscles: ["lats", "upper_back", "biceps", "rear_delts"] },
  { id: "chest-triceps", label: "Грудь и трицепс", muscles: ["chest", "triceps", "shoulders"] },
  { id: "shoulders-arms", label: "Плечи и руки", muscles: ["shoulders", "rear_delts", "biceps", "triceps"] },
  { id: "fullbody", label: "Фулбади", muscles: ["quads", "glutes", "chest", "lats", "upper_back", "shoulders", "core"] },
  { id: "core-functional", label: "Функционал и кор", muscles: ["core", "obliques", "lower_back", "full_body"], functional: true },
];

const BUILDER_EXERCISE_COUNT = { 30: 3, 45: 5, 60: 6, 75: 7 };
const CARDIO_PREFERENCE = ["elliptical", "bike", "treadmill", "rowing", "assault-bike", "ski-erg", "stairmaster", "jump-rope"];

function buildWorkoutFromGoal(goalId, minutes) {
  const goal = WORKOUT_GOALS.find((item) => item.id === goalId);
  if (!goal) return null;

  const available = exercises.filter((exercise) => isExerciseAvailable(exercise));
  const lastWorkout = state.workouts[state.workouts.length - 1];
  const lastIds = new Set((lastWorkout?.exercises || []).map((item) => item.exerciseId));
  const recentIds = new Set(
    state.workouts.slice(-3).flatMap((workout) => (workout.exercises || []).map((item) => item.exerciseId))
  );

  const pool = available.filter((exercise) => {
    if (exercise.cardio || exercise.type === "cardio") return false;
    const matchesMuscles = (exercise.primary || []).some((muscle) => goal.muscles.includes(muscle));
    if (goal.functional) return matchesMuscles || exercise.type === "functional";
    return matchesMuscles;
  });
  if (!pool.length) return null;

  const score = (exercise, muscle) => {
    let value = 0;
    if ((exercise.primary || [])[0] === muscle) value += 2;
    if ((exercise.primary || []).length >= 2) value += 1.5;
    if (exercise.equipment === "machine" || exercise.equipment === "barbell") value += 0.5;
    if (lastIds.has(exercise.id)) value -= 2.5;
    else if (recentIds.has(exercise.id)) value -= 1;
    value += Math.random() * 0.4;
    return value;
  };

  const targetCount = BUILDER_EXERCISE_COUNT[minutes] || 5;
  const picked = [];
  const pickedIds = new Set();
  const perMuscleCount = {};
  let cursor = 0;
  let guard = 0;
  while (picked.length < targetCount && guard < goal.muscles.length * 4) {
    guard += 1;
    const muscle = goal.muscles[cursor % goal.muscles.length];
    cursor += 1;
    if ((perMuscleCount[muscle] || 0) >= 2) continue;

    const candidates = pool
      .filter((exercise) => !pickedIds.has(exercise.id) && (exercise.primary || []).includes(muscle))
      .map((exercise) => ({ exercise, value: score(exercise, muscle) }));
    if (!candidates.length) continue;

    const best = candidates.sort((a, b) => b.value - a.value)[0].exercise;
    picked.push(best);
    pickedIds.add(best.id);
    perMuscleCount[muscle] = (perMuscleCount[muscle] || 0) + 1;
  }
  if (!picked.length) return null;

  // Сначала базовые многосуставные, изоляция и кор в конец.
  picked.sort((a, b) => (b.primary || []).length - (a.primary || []).length);

  const cardio = CARDIO_PREFERENCE.map((id) => available.find((exercise) => exercise.id === id)).filter(Boolean);
  const warmupMinutes = minutes >= 75 ? 12 : minutes >= 45 ? 10 : 8;
  const plan = [];
  if (cardio[0]) plan.push(planEntry(cardio[0].id, [[warmupMinutes, 1, ""]]));
  picked.forEach((exercise) => addExerciseToPlan(plan, exercise));
  if (minutes >= 60 && cardio.length) {
    const cooldown = cardio[1] || cardio[0];
    plan.push(planEntry(cooldown.id, [[5, 1, ""]]));
  }
  return { goal, plan };
}

function addExerciseToPlan(plan, exercise) {
  plan.push({
    uid: makeUid(),
    exerciseId: exercise.id,
    sourceNote: pickWorkingLoad(exercise) ? "вес из истории" : "нет истории, шаблон",
    sets: suggestedSetsForExercise(exercise).map(([weight, reps]) => ({
      weight,
      reps,
      rpe: "",
      done: false,
      mark: "normal",
    })),
  });
}

function fillBuilderGoals() {
  if (!elements.builderGoalSelect) return;
  elements.builderGoalSelect.innerHTML = WORKOUT_GOALS.map(
    (goal) => `<option value="${goal.id}">${goal.label}</option>`
  ).join("");
}

function runWorkoutBuilder() {
  const goalId = elements.builderGoalSelect?.value;
  const minutes = Number(elements.builderDurationSelect?.value) || 45;
  if (selected.length && !confirm("Заменить текущий план собранной тренировкой?")) return;

  const result = buildWorkoutFromGoal(goalId, minutes);
  if (!result) {
    showToast("Не хватает упражнений в «Моём зале» под эту цель", "warn");
    return;
  }

  selected = result.plan;
  elements.notesInput.value = `Конструктор: ${result.goal.label}, ~${minutes} мин. Держим RPE 6-8, без отказа.`;
  renderSelectedExercises();
  saveWorkoutDraft();
  const strengthCount = result.plan.filter((item) => !findExercise(item.exerciseId).cardio).length;
  showToast(`Собрал: ${result.goal.label} — ${strengthCount} упражнений + кардио`);
}

function nextMondayAfterLatestWorkout() {
  const next = new Date();
  const daysUntilMonday = (1 - next.getDay() + 7) % 7;
  next.setDate(next.getDate() + daysUntilMonday);
  return formatInputDate(next);
}

function nextPlannedWorkoutDate() {
  // Сначала календарь пользователя: ближайший запланированный день (сегодня или позже).
  const scheduled = nextScheduledDate();
  if (scheduled) return scheduled;

  const today = formatInputDate(new Date());
  if (!state.workouts.some((workout) => workout.date === today)) return today;
  const next = new Date();
  const daysUntilMonday = ((1 - next.getDay() + 7) % 7) || 7;
  next.setDate(next.getDate() + daysUntilMonday);
  return formatInputDate(next);
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

function currentPlanTitle() {
  const groups = [...new Set(selected.map((item) => findExercise(item.exerciseId)?.group).filter(Boolean))];
  if (!groups.length) return "Тренировка";
  if (groups.length <= 2) return groups.join(" + ");
  return `${groups.slice(0, 2).join(" + ")} +${groups.length - 2}`;
}

function renderWorkoutHeading() {
  const today = formatInputDate(new Date());
  const nextIso = nextPlannedWorkoutDate();
  const active = Boolean(workoutTimer.startedAt && !workoutTimer.stoppedAt);
  if (elements.workoutEyebrow) {
    elements.workoutEyebrow.textContent = active ? "Тренировка идёт" : nextIso === today ? "Сегодня" : "Ближайшая тренировка";
  }
  if (elements.workoutTitle) {
    elements.workoutTitle.textContent = currentPlanTitle();
  }
}

function weekWidgetDays() {
  const today = formatInputDate(new Date());
  const done = workoutDateSet();
  const start = new Date(`${mondayOf(new Date())}T00:00:00`);
  const labels = ["П", "В", "С", "Ч", "П", "С", "В"];
  return labels.map((label, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const iso = formatInputDate(date);
    let state = "rest";
    if (done.has(iso)) state = "done";
    else if (iso === today) state = "today";
    else if (isPlannedDate(iso)) state = "planned";
    return { label, state, iso };
  });
}

function widgetWhenLabel(iso) {
  const today = formatInputDate(new Date());
  if (!iso) return "План";
  if (iso === today) return "Сегодня";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (iso === formatInputDate(tomorrow)) return "Завтра";
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`));
}

// Сводка для виджетов на домашнем экране Android.
function updateNativeWidget() {
  renderWorkoutHeading();
  const bridge = window.Capacitor?.Plugins?.WidgetBridge;
  if (!bridge || !window.Capacitor?.isNativePlatform?.()) return;

  const dates = workoutDateSet();
  const nextIso = nextPlannedWorkoutDate();
  const last = state.workouts.at(-1);
  const active = Boolean(workoutTimer.startedAt && !workoutTimer.stoppedAt);
  const snapshot = window.TrainyWearable?.loadSnapshot?.() || {};

  const payload = {
    accent: currentAccent(),
    widgetStyle: currentWidgetStyle(),
    nextTitle: currentPlanTitle(),
    nextWhen: active ? "Идёт тренировка" : widgetWhenLabel(nextIso),
    nextMeta: active ? widgetProgressLine() : widgetPlanLine(),
    nextDate: nextIso || "",
    isActive: active,
    activeTimer: formatDuration(getWorkoutDurationMs()),
    // Виджет тикает сам через Chronometer, поэтому ему нужна точка старта, а не текст.
    startedAtMs: active ? workoutTimer.startedAt : 0,
    startLabel: active ? "Открыть" : "Начать",
    lastMeta: widgetLastLine(last),
    lastHr: active ? "" : widgetBandLine(last),
    lastDate: last?.date || "",
    streak: weeklyStreak(dates),
    weekWorkouts: [...dates].filter((iso) => iso >= mondayOf(new Date())).length,
    sleep: widgetReadinessLine(snapshot),
    week: weekWidgetDays(),
    updatedAt: new Date().toISOString(),
  };

  bridge.setWidgetData({ json: JSON.stringify(payload) }).catch(() => {});
}

// Что именно предстоит: упражнения, объём и прикидка времени.
function widgetPlanLine() {
  if (!selected.length) return "План ещё не собран — собери в приложении";
  const sets = selected.reduce((sum, item) => sum + item.sets.length, 0);
  const minutes = Math.round((sets * 2.6 + selected.length * 1.5) / 5) * 5;
  const names = selected
    .slice(0, 3)
    .map((item) => findExercise(item.exerciseId)?.name)
    .filter(Boolean)
    .join(", ");
  return `${selected.length} упр. · ${sets} подх. · ~${minutes} мин${names ? `\n${names}` : ""}`;
}

// Во время тренировки виджет показывает реальный прогресс, а не просто план.
function widgetProgressLine() {
  const sets = selected.flatMap((item) => item.sets);
  const doneSets = sets.filter((set) => set.done).length;
  const doneExercises = selected.filter((item) => item.sets.every((set) => set.done)).length;
  const current = selected.find((item) => item.sets.some((set) => !set.done));
  const currentName = current ? findExercise(current.exerciseId)?.name : null;
  return [
    `${doneSets}/${sets.length} подх. · ${doneExercises}/${selected.length} упр.`,
    currentName ? `Сейчас: ${currentName}` : "Все подходы закрыты",
  ].join("\n");
}

function widgetLastLine(last) {
  if (!last) return "Пока нет сохранённых сессий";
  const minutes = last.durationMinutes || (last.durationMs ? Math.round(last.durationMs / 60000) : null);
  const sets = (last.exercises || []).reduce(
    (sum, item) => sum + (item.sets || []).filter((set) => set.done !== false && set.mark !== "skip").length,
    0
  );
  const tonnage = workoutTonnage(last);
  const rpe = averageWorkoutRpe(last);
  const bits = [
    `Прошлая ${formatDate(last.date)}`,
    minutes ? `${minutes} мин` : null,
    sets ? `${sets} подх.` : null,
    tonnage ? `${formatNumber(Math.round(tonnage / 100) / 10)} т` : null,
    rpe ? `RPE ${rpe}` : null,
  ].filter(Boolean);
  return bits.join(" · ");
}

function widgetBandLine(last) {
  const band = last?.wearable;
  if (!band) return "";
  const bits = [
    band.hrAvg ? `пульс ${band.hrAvg}${band.hrMax ? `/${band.hrMax}` : ""}` : null,
    band.calories ? `${band.calories} ккал` : null,
    band.sessionTypeLabel || null,
  ].filter(Boolean);
  return bits.join(" · ");
}

function widgetReadinessLine(snapshot) {
  const api = window.TrainyWearable;
  const bits = [];
  if (snapshot.sleepMinutes) bits.push(`сон ${api.formatMinutes(snapshot.sleepMinutes)}`);
  if (snapshot.restingHr) bits.push(`пульс покоя ${snapshot.restingHr}`);
  if (!bits.length) return "";
  const readiness = api?.readinessFromSnapshot?.(snapshot);
  const tone = readiness === "bad" ? "лучше лайт" : readiness === "good" ? "готов" : "средне";
  return `${bits.join(" · ")} → ${tone}`;
}

function workoutTonnage(workout) {
  return (workout.exercises || []).reduce((sum, item) => {
    if (findExercise(item.exerciseId)?.cardio) return sum;
    return sum + (item.sets || [])
      .filter((set) => set.done !== false && set.mark !== "skip")
      .reduce((setSum, set) => setSum + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0);
  }, 0);
}

function handleWidgetAction(action) {
  if (!action) return;
  if (action === "start" || action === "open") {
    window.showAppView?.("workout");
    if (action === "start" && !workoutTimer.startedAt) startWorkoutTimer();
    return;
  }
  if (action === "last") {
    const last = state.workouts.at(-1);
    if (last) {
      selectedDayIso = last.date;
      calendarCursor = new Date(`${last.date}T00:00:00`);
    }
    window.showAppView?.("calendar");
    renderScheduleCalendar();
    renderDayDetail();
  }
}

async function consumeWidgetLaunch() {
  window.trainyHandleWidgetAction = handleWidgetAction;
  const widgetSection = document.querySelector("#widgetPinSection");
  const native = Boolean(window.Capacitor?.isNativePlatform?.());
  if (widgetSection) widgetSection.hidden = !native;
  const bridge = window.Capacitor?.Plugins?.WidgetBridge;
  if (!bridge?.consumeAction) return;
  try {
    const result = await bridge.consumeAction();
    handleWidgetAction(result?.action);
  } catch {
    // виджет недоступен в браузере
  }
}

async function pinNativeWidget(id) {
  const bridge = window.Capacitor?.Plugins?.WidgetBridge;
  if (!bridge?.pinWidget || !window.Capacitor?.isNativePlatform?.()) {
    showToast("Виджеты есть только в Android-приложении", "warn");
    return;
  }
  try {
    const result = await bridge.pinWidget({ id });
    if (result?.requested) {
      showToast("Подтверди добавление виджета на рабочий стол");
      return;
    }
    showToast("Xiaomi прячет их: долгий тап по столу → Виджеты → Приложения с виджетами → Все → Android-виджеты", "warn");
  } catch {
    showToast("Не получилось открыть диалог виджета", "warn");
  }
}

function bestWeeklyStreak(dates) {
  const weeks = [...new Set([...dates].map((iso) => mondayOf(new Date(iso))))].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  weeks.forEach((week) => {
    const gap = prev ? Math.round((new Date(week) - new Date(prev)) / (7 * 86400000)) : null;
    run = gap === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = week;
  });
  return best;
}

function funTonnageLabel(kg) {
  if (kg >= 150000) return `≈ ${Math.round(kg / 150000)} синих китов`;
  if (kg >= 12000) return `≈ ${Math.round(kg / 6000)} слонов`;
  if (kg >= 3000) return `≈ ${Math.round(kg / 1500)} автомобиля`;
  if (kg >= 400) return `≈ ${Math.round(kg / 200)} холодильника`;
  return "";
}

function renderStats() {
  const workouts = state.workouts;
  const dates = workoutDateSet();

  let tonnageKg = 0;
  let totalReps = 0;
  let totalMinutes = 0;
  const favoriteCounts = new Map();

  workouts.forEach((workout) => {
    totalMinutes += workout.durationMinutes || 0;
    (workout.exercises || []).forEach((item) => {
      const meta = findExercise(item.exerciseId);
      const doneSets = (item.sets || []).filter(
        (set) => (set.done || set.done === undefined) && set.mark !== "skip"
      );
      if (!doneSets.length) return;
      favoriteCounts.set(item.exerciseId, (favoriteCounts.get(item.exerciseId) || 0) + 1);
      if (meta.cardio) return;
      doneSets.forEach((set) => {
        const reps = Number(set.reps) || 0;
        totalReps += reps;
        tonnageKg += (Number(set.weight) || 0) * reps;
      });
    });
  });

  const bandKcal = workouts.reduce((sum, workout) => sum + (Number(workout.wearable?.calories) || 0), 0);
  const favorite = [...favoriteCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const favoriteName = favorite ? findExercise(favorite[0]).name : null;
  const bestStreak = bestWeeklyStreak(dates);
  const firstDate = workouts.length ? formatDate(workouts[0].date) : null;
  const hours = Math.round(totalMinutes / 60);
  const comparison = funTonnageLabel(tonnageKg);
  const tonnageValue = tonnageKg >= 1000
    ? `${formatNumber(Math.round(tonnageKg / 100) / 10)} т`
    : `${formatNumber(Math.round(tonnageKg))} кг`;

  elements.statsGrid.innerHTML = [
    stat(tonnageValue, `поднято за всё время${comparison ? ` · ${comparison}` : ""}`),
    stat(formatNumber(totalReps), "повторов сделано"),
    stat(bestStreak, `${plural(bestStreak, "неделя", "недели", "недель")} подряд — лучшая серия`),
    favorite ? stat(`${favorite[1]}×`, `любимое упражнение — ${favoriteName}`) : null,
    hours ? stat(hours, `${plural(hours, "час", "часа", "часов")} в зале суммарно`) : null,
    bandKcal ? stat(`${formatNumber(bandKcal)}`, "ккал с браслета за все сессии") : null,
    stat(workouts.length, firstDate ? `${plural(workouts.length, "тренировка", "тренировки", "тренировок")} с ${firstDate}` : "тренировок сохранено"),
  ].filter(Boolean).join("");
}

function stat(value, label) {
  return `<article class="stat"><strong>${value}</strong><span>${label}</span></article>`;
}

function renderDashboard() {
  renderPrBoard();
}

function renderPrBoard() {
  const targets = ["bench", "leg-press", "gravitron", "row", "deadlift", "db-press", "butterfly", "shoulder-press"];
  const rows = targets
    .map((exerciseId) => bestExercisePerformance(state.workouts, exerciseId))
    .filter(Boolean)
    .map(({ exercise, set, workout }) => {
      const unit = shortUnit(exercise);
      const value = `${formatNumber(set.weight)} ${unit}`;
      const subtitle = exercise.lowerIsBetter
        ? `${formatDate(workout.date)} · меньше противовес = сильнее`
        : `${set.reps} повт · ${formatDate(workout.date)}`;
      return `
        <article class="pr-item">
          <div>
            <strong>${exercise.name}</strong>
            <span>${subtitle}</span>
          </div>
          <div class="pr-value">${value}</div>
        </article>
      `;
    })
    .join("");

  elements.prBoard.innerHTML = rows || `<div class="empty">PR появятся после загрузки истории.</div>`;
}

function renderSelectedExercises() {
  elements.selectedExercises.innerHTML = "";

  selected.forEach((item, index) => {
    const exercise = findExercise(item.exerciseId);
    const fragment = elements.exerciseTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".exercise-card");
    card.dataset.uid = item.uid;
    if (isExerciseComplete(item)) card.classList.add("exercise-complete");
    const indexBadge = card.querySelector(".exercise-index");
    if (indexBadge) indexBadge.textContent = String(index + 1);
    card.querySelector("h3").textContent = exercise.name;
    card.querySelector("p").textContent = exerciseSubtitle(exercise, item);
    const moveUpButton = card.querySelector(".move-up");
    const moveDownButton = card.querySelector(".move-down");
    moveUpButton.disabled = index === 0;
    moveDownButton.disabled = index === selected.length - 1;
    moveUpButton.addEventListener("click", () => moveSelectedExercise(item.uid, -1));
    moveDownButton.addEventListener("click", () => moveSelectedExercise(item.uid, 1));
    card.querySelector(".remove-exercise").addEventListener("click", () => {
      selected = selected.filter((selectedItem) => selectedItem.uid !== item.uid);
      renderSelectedExercises();
      saveWorkoutDraft();
    });

    const sets = card.querySelector(".sets");
    item.sets.forEach((set, index) => sets.appendChild(renderSetRow(item.uid, index, set, exercise)));
    card.querySelector(".add-set").addEventListener("click", () => {
      const last = item.sets.at(-1) || { weight: 0, reps: 10, rpe: "" };
      item.sets.push({ ...last, rpe: "", done: false, mark: "normal" });
      renderSelectedExercises();
      saveWorkoutDraft();
    });

    elements.selectedExercises.appendChild(fragment);
  });

  renderPlanSummary();
  renderWorkoutHeading();
}

function moveSelectedExercise(uid, direction) {
  const currentIndex = selected.findIndex((item) => item.uid === uid);
  const targetIndex = currentIndex + direction;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= selected.length) return;

  const title = findExerciseTitle(uid);
  const previousTitleTop = title ? title.getBoundingClientRect().top : null;
  [selected[currentIndex], selected[targetIndex]] = [selected[targetIndex], selected[currentIndex]];
  renderSelectedExercises();
  saveWorkoutDraft();
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
    <label>RPE<input type="number" step="0.5" min="1" max="10" placeholder="7-10" value="${set.rpe}" data-field="rpe" /></label>
    <label>Метка
      <select data-field="mark">
        <option value="easy" ${set.mark === "easy" ? "selected" : ""}>легко</option>
        <option value="normal" ${!set.mark || set.mark === "normal" ? "selected" : ""}>норм</option>
        <option value="hard" ${set.mark === "hard" ? "selected" : ""}>тяжело</option>
        <option value="skip" ${set.mark === "skip" ? "selected" : ""}>скип</option>
      </select>
    </label>
    <button class="delete-set" type="button" aria-label="Убрать подход" title="Убрать подход">×</button>
  `;

  row.querySelectorAll("input[data-field], select[data-field]").forEach((input) => {
    const updateSet = () => {
      const item = selected.find((selectedItem) => selectedItem.uid === uid);
      item.sets[index][input.dataset.field] = input.type === "checkbox" ? input.checked : input.value;
      if (input.dataset.field === "done") {
        // Метка времени подхода — основа для разбора пульса по упражнениям и отдыху.
        item.sets[index].doneAt = input.checked ? Date.now() : null;
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

function makeUid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function wearableApi() {
  return window.TrainyWearable;
}

function formatWearableLine(snapshot) {
  return wearableApi()?.hintFromSnapshot?.(snapshot) || "";
}

function renderWearableCabinet(snapshot, statusText) {
  if (elements.wearableStatus && statusText) {
    elements.wearableStatus.textContent = statusText;
  }
  if (elements.bandPageMeta) {
    elements.bandPageMeta.textContent = snapshot ? sourceWhen(snapshot) : "Сон, пульс, шаги и калории";
  }
  const cards = bandStatCards(snapshot);
  if (elements.wearableStats) {
    elements.wearableStats.hidden = !cards.length;
    elements.wearableStats.innerHTML = cards
      .map(([label, value]) => `<div class="wearable-stat"><span>${label}</span><strong>${value}</strong></div>`)
      .join("");
  }
  renderBandSleep(snapshot);
  renderBandLastSession();
  renderBandAnalytics();
}

function bandStatCards(snapshot) {
  if (!snapshot) return [];
  return [
    snapshot.sleepMinutes ? ["Сон", wearableApi().formatMinutes(snapshot.sleepMinutes)] : null,
    snapshot.restingHr ? ["Пульс покоя", `${snapshot.restingHr}`] : snapshot.lastHr ? ["Пульс", `${snapshot.lastHr}`] : null,
    snapshot.todayCalories ? ["Активные ккал", `${snapshot.todayCalories}`] : null,
    snapshot.todayTotalCalories ? ["Всего ккал", `${snapshot.todayTotalCalories}`] : null,
    snapshot.todaySteps != null ? ["Шаги", Number(snapshot.todaySteps).toLocaleString("ru-RU")] : null,
    snapshot.todayDistanceKm ? ["Дистанция", `${snapshot.todayDistanceKm} км`] : null,
  ].filter(Boolean);
}

function renderBandSleep(snapshot) {
  const box = elements.bandSleepCard;
  if (!box) return;
  if (!snapshot?.sleepMinutes) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const fmt = wearableApi().formatMinutes;
  const bits = [
    snapshot.sleepDeepMinutes ? `глубокий ${fmt(snapshot.sleepDeepMinutes)}` : null,
    snapshot.sleepLightMinutes ? `лёгкий ${fmt(snapshot.sleepLightMinutes)}` : null,
    snapshot.sleepRemMinutes ? `REM ${fmt(snapshot.sleepRemMinutes)}` : null,
  ].filter(Boolean);
  box.hidden = false;
  box.innerHTML = `
    <strong>Сон за ночь</strong>
    <span>${fmt(snapshot.sleepMinutes)}${bits.length ? ` · ${bits.join(" · ")}` : ""}</span>
  `;
}

function renderBandLastSession() {
  const box = elements.bandLastSession;
  if (!box) return;
  const last = state.workouts.at(-1);
  if (!last) {
    box.innerHTML = "";
    return;
  }

  const band = last.wearable;
  const index = state.workouts.indexOf(last);
  if (!band?.hrAvg && !band?.calories) {
    box.innerHTML = `
      <div class="band-page-block">
        <h3>Последняя сессия · ${formatDate(last.date)}</h3>
        <p class="wearable-help">Пульса за эту тренировку в Health Connect пока нет. Браслет отдаёт данные с задержкой — открой Mi Fitness, дождись синхронизации и нажми «Подтянуть с браслета».</p>
        <button class="button secondary" type="button" data-band-resync="${index}">Подтянуть с браслета</button>
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="band-page-block">
      <h3>Последняя сессия · ${formatDate(last.date)}</h3>
      ${bandSessionSummaryHtml(band)}
      ${hrChartHtml(band)}
      ${zoneBarHtml(band)}
      ${exerciseHeartHtml(last)}
      ${restRecoveryHtml(last)}
      <button class="button ghost" type="button" data-band-resync="${index}">Подтянуть с браслета</button>
    </div>
  `;
}

function bandSessionSummaryHtml(band) {
  const cards = [
    band.hrAvg ? ["Средний пульс", `${band.hrAvg}`] : null,
    band.hrMax ? ["Максимум", `${band.hrMax}`] : null,
    band.calories ? ["Калории", `${band.calories}`] : null,
    band.sessionTypeLabel ? ["Характер", band.sessionTypeLabel] : null,
  ].filter(Boolean);
  const note = band.caloriesSource === "estimate"
    ? `Калории посчитаны по пульсу и весу: браслет отдал ${band.caloriesActive || 0} ккал активных, это явно мало для такой сессии.`
    : `Калории с браслета${band.caloriesEstimate ? ` (расчёт по пульсу дал бы ${band.caloriesEstimate})` : ""}.`;
  const sources = (band.caloriesBySource || [])
    .map((row) => `${row.source}: ${row.kcal} ккал`)
    .join(" · ");
  return `
    <div class="wearable-stats">
      ${cards.map(([label, value]) => `<div class="wearable-stat"><span>${label}</span><strong>${value}</strong></div>`).join("")}
    </div>
    <p class="wearable-help">${escapeHtml(note)}${sources ? `<br>Кто записал калории за это окно: ${escapeHtml(sources)}` : ""}</p>
  `;
}

// График пульса с подложкой зон: видно, где сердце уходило в анаэроб.
function hrChartHtml(band) {
  const series = (band.hrSeries || [])
    .map((point) => ({ bpm: Number(point.bpm) || 0, t: Date.parse(point.t) }))
    .filter((point) => point.bpm > 30 && Number.isFinite(point.t));
  if (series.length < 3) return "";

  const width = 320;
  const height = 132;
  const values = series.map((point) => point.bpm);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const lo = Math.max(40, Math.floor((min - 6) / 5) * 5);
  const hi = Math.ceil((max + 6) / 5) * 5;
  const y = (bpm) => height - ((bpm - lo) / Math.max(1, hi - lo)) * height;
  const x = (index) => (index / (series.length - 1)) * width;
  const path = series.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.bpm).toFixed(1)}`).join(" ");
  const hrMax = band.hrMaxUsed || 190;
  const bands = [
    ["#3d4451", 0, 0.6],
    ["#2f6f4f", 0.6, 0.7],
    ["#3f7f3a", 0.7, 0.8],
    ["#9a7b28", 0.8, 0.9],
    ["#96402f", 0.9, 1.3],
  ].map(([color, from, to]) => {
    const top = y(Math.min(hi, hrMax * to));
    const bottom = y(Math.max(lo, hrMax * from));
    if (bottom - top <= 0.5) return "";
    return `<rect x="0" y="${top.toFixed(1)}" width="${width}" height="${(bottom - top).toFixed(1)}" fill="${color}" opacity="0.28" />`;
  }).join("");

  const minutes = Math.max(1, Math.round((series.at(-1).t - series[0].t) / 60000));
  return `
    <div class="hr-chart">
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Пульс за тренировку">
        ${bands}
        <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />
      </svg>
      <div class="hr-chart-axis"><span>${lo}</span><span>${minutes} мин · ${series.length} точек</span><span>${hi}</span></div>
    </div>
  `;
}

// Пульс по упражнениям: окно подхода — это время от прошлой отметки до текущей.
function exerciseSetWindows(workout) {
  const marks = [];
  (workout.exercises || []).forEach((item) => {
    (item.sets || []).forEach((set, setIndex) => {
      const doneAt = Number(set.doneAt) || 0;
      if (doneAt) marks.push({ exerciseId: item.exerciseId, setIndex, doneAt });
    });
  });
  marks.sort((a, b) => a.doneAt - b.doneAt);
  return marks.map((mark, index) => {
    const previous = marks[index - 1];
    const from = previous ? previous.doneAt : mark.doneAt - 60000;
    return { ...mark, from, to: mark.doneAt };
  });
}

function hrSeriesPoints(workout) {
  return (workout.wearable?.hrSeries || [])
    .map((point) => ({ bpm: Number(point.bpm) || 0, t: Date.parse(point.t) }))
    .filter((point) => point.bpm > 30 && Number.isFinite(point.t));
}

function exerciseHeartHtml(workout) {
  const points = hrSeriesPoints(workout);
  const windows = exerciseSetWindows(workout);
  if (points.length < 3 || !windows.length) {
    return windows.length
      ? ""
      : `<p class="wearable-help">Отмечай подходы галочкой во время тренировки — тогда приложение разложит пульс по упражнениям и паузам.</p>`;
  }

  const byExercise = new Map();
  windows.forEach((window) => {
    const inside = points.filter((point) => point.t >= window.from && point.t <= window.to);
    if (!inside.length) return;
    const stats = byExercise.get(window.exerciseId) || { sum: 0, count: 0, max: 0, sets: 0 };
    inside.forEach((point) => {
      stats.sum += point.bpm;
      stats.count += 1;
      stats.max = Math.max(stats.max, point.bpm);
    });
    stats.sets += 1;
    byExercise.set(window.exerciseId, stats);
  });
  if (!byExercise.size) return "";

  const rows = [...byExercise.entries()]
    .map(([exerciseId, stats]) => ({
      name: findExercise(exerciseId)?.name || exerciseId,
      avg: Math.round(stats.sum / stats.count),
      max: stats.max,
      sets: stats.sets,
    }))
    .sort((a, b) => b.avg - a.avg);
  const peak = Math.max(...rows.map((row) => row.max), 1);

  return `
    <div class="band-exercise-hr">
      <strong>Пульс по упражнениям</strong>
      ${rows.map((row) => `
        <div class="band-exercise-hr-row">
          <span>${escapeHtml(row.name)}</span>
          <i><em style="width:${Math.max(8, Math.round((row.avg / peak) * 100))}%"></em></i>
          <b>${row.avg}<small>/${row.max}</small></b>
        </div>
      `).join("")}
    </div>
  `;
}

// Насколько быстро пульс падает после подхода — прямая оценка качества отдыха.
function restRecoveryHtml(workout) {
  const points = hrSeriesPoints(workout);
  const windows = exerciseSetWindows(workout);
  if (points.length < 5 || windows.length < 2) return "";

  const drops = [];
  windows.forEach((window) => {
    const at = points.filter((point) => point.t <= window.to).at(-1);
    if (!at) return;
    const after = points.filter((point) => point.t > window.to && point.t <= window.to + 90000);
    if (!after.length) return;
    drops.push(at.bpm - Math.min(...after.map((point) => point.bpm)));
  });
  if (drops.length < 2) return "";

  const avgDrop = Math.round(drops.reduce((sum, value) => sum + value, 0) / drops.length);
  const restGaps = windows
    .slice(1)
    .map((window, index) => (window.to - windows[index].to) / 1000)
    .filter((seconds) => seconds > 20 && seconds < 900);
  const avgRest = restGaps.length
    ? Math.round(restGaps.reduce((sum, value) => sum + value, 0) / restGaps.length)
    : null;
  const verdict = avgDrop >= 20
    ? "Пульс падает хорошо — восстановление в норме."
    : avgDrop >= 10
      ? "Восстановление среднее: паузы можно чуть удлинить."
      : "Пульс почти не падает между подходами — отдыхай дольше или снизь вес.";

  return `
    <div class="band-recovery">
      <strong>Отдых между подходами</strong>
      <span>Падение пульса за 90 сек: −${avgDrop} уд.${avgRest ? ` · средняя пауза ${Math.round(avgRest)} сек` : ""}</span>
      <span>${verdict}</span>
    </div>
  `;
}

function hrSparklineSvg(series) {
  const points = (series || []).map((sample) => Number(sample.bpm) || 0).filter((bpm) => bpm > 30);
  if (points.length < 2) return "";
  const width = 280;
  const height = 72;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(8, max - min);
  const path = points.map((bpm, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - 8 - ((bpm - min) / span) * (height - 16);
    return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg class="hr-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
}

function zoneBarHtml(wearable) {
  const shares = wearable?.zoneShares;
  if (!shares) return "";
  const labels = wearableApi()?.ZONE_LABELS || {};
  const order = wearableApi()?.ZONE_ORDER || ["warmup", "fat", "aerobic", "anaerobic", "peak"];
  return `<div class="band-zones">${order.map((key) => `
    <div class="band-zone">
      <i><em style="width:${Math.max(6, shares[key] || 0)}%"></em></i>
      <span>${labels[key] || key} ${shares[key] || 0}%</span>
    </div>
  `).join("")}</div>`;
}

function wearableCardHtml(wearable) {
  if (!wearable) return "";
  const bits = [];
  if (wearable.sessionTypeLabel) bits.push(wearable.sessionTypeLabel);
  if (wearable.hrAvg) bits.push(`пульс ${wearable.hrAvg} (${wearable.hrMin}–${wearable.hrMax})`);
  if (wearable.calories) {
    bits.push(`${wearable.calories} ккал${wearable.caloriesSource === "estimate" ? " оценка" : ""}`);
  }
  if (wearable.steps != null) bits.push(`шаги ${Number(wearable.steps).toLocaleString("ru-RU")}`);
  if (!bits.length && !wearable.hrSeries?.length) return "";
  return `
    <div class="wearable-session">
      <div class="wearable-session-top">
        <strong>${escapeHtml(bits[0] || "Браслет")}</strong>
        ${bits.slice(1).map((bit) => `<span>${escapeHtml(bit)}</span>`).join("")}
      </div>
      ${hrSparklineSvg(wearable.hrSeries)}
      ${zoneBarHtml(wearable)}
    </div>
  `;
}

function renderWearableHint() {
  const button = elements.wearableApplyHint;
  if (!button) return;
  const snapshot = wearableApi()?.loadSnapshot?.();
  const hint = formatWearableLine(snapshot);
  const suggested = wearableApi()?.readinessFromSnapshot?.(snapshot);
  if (!hint || !suggested || suggested === elements.readinessInput.value) {
    button.hidden = true;
    button.textContent = "";
    return;
  }
  button.hidden = false;
  button.textContent = `С браслета: ${hint}`;
}

async function initWearable() {
  const api = wearableApi();
  if (!api) return;
  const snapshot = api.loadSnapshot();
  renderWearableCabinet(snapshot, snapshot ? `Последние данные: ${sourceWhen(snapshot)}` : "Сон, пульс, калории и шаги через Health Connect");
  renderWearableHint();
  if (!api.isNative()) {
    renderWearableCabinet(snapshot, "На телефоне открой Android-приложение: браузер до Mi Band не достучится.");
    return;
  }
  try {
    const availability = await api.availability();
    if (!availability?.available) {
      renderWearableCabinet(
        snapshot,
        availability?.reason === "update"
          ? "Обнови Health Connect, затем подключи браслет."
          : "Поставь Health Connect и включи обмен в Mi Fitness."
      );
      return;
    }
    if (snapshot) await refreshWearable(true);
    else renderWearableCabinet(snapshot, "Нажми «Подключить» на этой вкладке");
    await autoResyncRecentBand();
  } catch {
    renderWearableHint();
  }
}

function sourceWhen(snapshot) {
  if (!snapshot?.updatedAt) return snapshot?.sourceLabel || "браслет";
  const time = new Date(snapshot.updatedAt);
  if (Number.isNaN(time.getTime())) return snapshot.sourceLabel || "браслет";
  return `${snapshot.sourceLabel || "браслет"}, ${time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

async function connectWearable() {
  const api = wearableApi();
  if (!api) return;
  elements.wearableConnectButton.disabled = true;
  try {
    const snapshot = await api.connect();
    renderWearableCabinet(snapshot, `Подключено: ${sourceWhen(snapshot)}`);
    renderWearableHint();
    renderCoach();
    showToast("Mi Band подключён");
  } catch (error) {
    renderWearableCabinet(api.loadSnapshot(), error.message || "Не удалось подключить браслет");
    showToast(error.message || "Не удалось подключить браслет", "warn");
  } finally {
    elements.wearableConnectButton.disabled = false;
  }
}

async function refreshWearable(silent = false) {
  const api = wearableApi();
  if (!api?.isNative?.()) return;
  try {
    const snapshot = await api.refresh();
    renderWearableCabinet(snapshot, `Обновил: ${sourceWhen(snapshot)}`);
    renderWearableHint();
    updateNativeWidget();
    if (!silent) showToast("Данные браслета обновлены");
  } catch (error) {
    if (!silent) {
      renderWearableCabinet(api.loadSnapshot(), error.message || "Нет свежих данных с браслета");
      showToast(error.message || "Нет данных с браслета", "warn");
    }
  }
}

// Данные с браслета приезжают позже конца тренировки, поэтому сессию можно перечитать.
async function resyncWorkoutBand(index, { silent = false } = {}) {
  const workout = state.workouts[index];
  const api = wearableApi();
  if (!workout || !api?.resyncWorkout || !api.isNative?.()) {
    if (!silent) showToast("Доступно только в Android-приложении", "warn");
    return false;
  }

  if (!silent) showToast("Читаю данные с браслета…");
  let metrics = null;
  try {
    metrics = await api.resyncWorkout({
      startIso: workout.startedAt || workout.wearable?.windowStart,
      endIso: workout.endedAt || workout.wearable?.windowEnd,
      dateIso: workout.date,
    });
  } catch {
    metrics = null;
  }

  if (!metrics?.hrAvg && !metrics?.calories) {
    if (!silent) showToast("Health Connect пока не отдал эту сессию", "warn");
    return false;
  }

  workout.wearable = { ...(workout.wearable || {}), ...metrics };
  saveState();
  window.cloudSync?.pushWorkout?.(workout);
  renderWearableCabinet(api.loadSnapshot(), "Данные сессии обновлены");
  updateNativeWidget();
  if (!silent) showToast(`Подтянул: пульс ${metrics.hrAvg || "—"}, ${metrics.calories || "—"} ккал`);
  return true;
}

// Тихо дочитываем свежую тренировку, если браслет не успел синхронизироваться к сохранению.
async function autoResyncRecentBand() {
  const api = wearableApi();
  if (!api?.isNative?.()) return;
  const index = state.workouts.length - 1;
  const workout = state.workouts[index];
  if (!workout || workout.wearable?.hrAvg) return;
  const finished = Date.parse(workout.endedAt || `${workout.date}T23:59:59`);
  if (!Number.isFinite(finished) || Date.now() - finished > 48 * 3600 * 1000) return;
  await resyncWorkoutBand(index, { silent: true });
}

async function renderBandDiagnostics() {
  const box = document.querySelector("#bandDiagnostics");
  const api = wearableApi();
  if (!box) return;
  if (!api?.diagnostics || !api.isNative?.()) {
    box.innerHTML = `<p class="wearable-help">Диагностика доступна в Android-приложении.</p>`;
    return;
  }
  box.innerHTML = `<p class="wearable-help">Читаю Health Connect…</p>`;
  let report = null;
  try {
    report = await api.diagnostics();
  } catch {
    report = null;
  }
  if (!report?.rows?.length) {
    box.innerHTML = `<p class="wearable-help">Health Connect не вернул записи за сутки. Открой Mi Fitness → Health Connect и разреши обмен.</p>`;
    return;
  }
  box.innerHTML = `
    <p class="wearable-help">За последние 24 часа Health Connect отдал:</p>
    ${report.rows.map((row) => `
      <div class="band-diag-row">
        <span>${escapeHtml(row.label)}</span>
        <b>${formatNumber(row.sum)}</b>
        <small>${row.records} записей${(row.sources || []).length ? ` · ${escapeHtml((row.sources || []).join(", "))}` : " · нет источника"}</small>
      </div>
    `).join("")}
  `;
}

async function openWearableSettings() {
  try {
    await wearableApi()?.openSettings?.();
  } catch (error) {
    showToast(error.message || "Открой Health Connect вручную", "warn");
  }
}

function applyWearableReadiness() {
  const snapshot = wearableApi()?.loadSnapshot?.();
  const suggested = wearableApi()?.readinessFromSnapshot?.(snapshot);
  if (!suggested) return;
  elements.readinessInput.value = suggested;
  renderCoach();
  saveWorkoutDraft();
}

async function attachWearableMetrics(workout) {
  const api = wearableApi();
  if (!api?.sessionMetrics) return null;
  try {
    if (api.isNative?.()) showToast("Снимаю пульс и калории с браслета…");
    return await api.sessionMetrics(workoutTimer.startedAt, workoutTimer.stoppedAt || Date.now());
  } catch {
    return null;
  }
}

function startLiveBandHr() {
  stopLiveBandHr();
  pollLiveBandHr();
  liveBandHrTimer = window.setInterval(pollLiveBandHr, 40000);
}

function stopLiveBandHr() {
  if (liveBandHrTimer) {
    window.clearInterval(liveBandHrTimer);
    liveBandHrTimer = null;
  }
}

async function pollLiveBandHr() {
  const node = elements.bandLiveHr;
  const api = wearableApi();
  if (!node || !api?.liveHeartRate || !api.isNative?.()) return;
  try {
    const live = await api.liveHeartRate();
    if (!live?.bpm) return;
    node.hidden = false;
    node.textContent = `${live.bpm}`;
  } catch {
    // пульс во время сессии не обязателен
  }
}

function wearableReportLine(wearable) {
  if (!wearable) return "";
  const bits = [];
  if (wearable.sessionTypeLabel) bits.push(wearable.sessionTypeLabel);
  if (wearable.calories) bits.push(`${wearable.calories} ккал${wearable.caloriesSource === "estimate" ? " оценка" : ""}`);
  if (wearable.sleepMinutes) bits.push(`сон ${wearableApi().formatMinutes(wearable.sleepMinutes)}`);
  if (wearable.restingHr) bits.push(`пульс покоя ${wearable.restingHr}`);
  if (wearable.hrAvg) bits.push(`пульс сессии ${wearable.hrAvg} (${wearable.hrMin}–${wearable.hrMax})`);
  if (wearable.steps != null) bits.push(`шаги ${Number(wearable.steps).toLocaleString("ru-RU")}`);
  return bits.length ? `Браслет: ${bits.join(", ")}` : "";
}

function renderBandAnalytics() {
  const box = elements.bandChart;
  if (!box) return;
  const rows = state.workouts
    .filter((workout) => workout.wearable?.calories || workout.wearable?.hrAvg)
    .slice(-8)
    .reverse();
  if (!rows.length) {
    box.innerHTML = `<div class="empty">После тренировок здесь появятся зоны и калории с браслета.</div>`;
    return;
  }
  const maxCalories = Math.max(...rows.map((workout) => Number(workout.wearable.calories) || 0), 1);
  box.innerHTML = rows.map((workout) => {
    const kcal = Number(workout.wearable.calories) || 0;
    const type = workout.wearable.sessionTypeLabel || "Браслет";
    const hr = workout.wearable.hrAvg ? ` · пульс ${workout.wearable.hrAvg}` : "";
    return `
      <div class="band-analytics-row">
        <small>${formatDate(workout.date)}</small>
        <div>
          <div class="band-analytics-bar"><span style="width:${Math.max(8, Math.round((kcal / maxCalories) * 100))}%"></span></div>
          <span>${escapeHtml(type)}${hr}</span>
        </div>
        <strong>${kcal ? `${kcal} ккал` : "—"}</strong>
      </div>
    `;
  }).join("");
}

function renderCoach() {
  const readiness = elements.readinessInput.value;
  elements.readinessPill.textContent = readinessLabel(readiness);
  elements.readinessPill.className = `pill ${readiness === "good" ? "good" : readiness === "bad" ? "bad" : "warn"}`;
  renderWearableHint();

  const scheduleCard = scheduleCoachCardHtml();

  const fatigue = fatigueScore(state.workouts);
  const next = nextSessionSuggestion(state.workouts, readiness, fatigue);
  elements.coachBox.innerHTML = scheduleCard + next.map((item) => `
    <article class="coach-card">
      <strong>${item.title}</strong>
      <p>${item.text}</p>
    </article>
  `).join("");
}

function scheduleCoachCardHtml() {
  const today = formatInputDate(new Date());
  const next = nextScheduledDate();

  if (!next) {
    return `
      <article class="coach-card schedule-card">
        <strong>Календарь пуст</strong>
        <p>Отметь дни во вкладке «Календарь» — вручную или через повторяющееся расписание (пн/ср/пт), и план с рекомендациями привяжутся к ближайшей дате.</p>
      </article>
    `;
  }

  const diffDays = Math.round((new Date(next) - new Date(today)) / 86400000);
  const weekday = new Date(next).toLocaleDateString("ru-RU", { weekday: "long" });
  const when =
    diffDays === 0 ? "сегодня" : diffDays === 1 ? "завтра" : `${formatDate(next)}, ${weekday} (через ${diffDays} дн.)`;
  const doneToday = workoutDateSet().has(today);

  return `
    <article class="coach-card schedule-card">
      <strong>Следующая тренировка: ${when}</strong>
      <p>${doneToday && diffDays === 0
        ? "Сегодня уже есть сохранённая тренировка — отдыхай или сделай лёгкое кардио."
        : diffDays === 0
          ? "День тренировки по твоему календарю. План и веса уже в форме — жми «Начать тренировку»."
          : "До неё восстанавливаемся: сон, шаги, лёгкая растяжка. План в форме уже подготовлен под эту дату."}</p>
    </article>
  `;
}

// ── AI-тренер: чат-агент с инструментами ────────────────────────────

function isTouchDevice() {
  return window.matchMedia?.("(pointer: coarse)").matches;
}

function getAiApiKey() {
  return (localStorage.getItem(AI_KEY_STORAGE) || "").trim();
}

function getAiBaseUrl() {
  return (localStorage.getItem(AI_BASE_STORAGE) || AI_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function saveAiApiKey() {
  const key = (elements.aiApiKeyInput?.value || "").trim();
  if (!key) {
    localStorage.removeItem(AI_KEY_STORAGE);
    setAiStatus("AI key удалён с этого устройства.");
    updateCabinetStatus();
    return;
  }

  localStorage.setItem(AI_KEY_STORAGE, key);
  elements.aiApiKeyInput.value = "";
  setAiStatus("AI key сохранён. Он хранится только в этом браузере.");
  updateCabinetStatus();
}

function saveAiBaseUrl() {
  const value = (elements.aiBaseUrlInput?.value || "").trim().replace(/\/+$/, "");
  if (!value) {
    localStorage.removeItem(AI_BASE_STORAGE);
    if (elements.aiBaseUrlInput) elements.aiBaseUrlInput.value = "";
    setAiStatus("AI URL сброшен: снова использую api.openai.com.");
    return;
  }

  if (!/^https:\/\/.+/i.test(value)) {
    setAiStatus("AI URL должен начинаться с https://");
    return;
  }

  localStorage.setItem(AI_BASE_STORAGE, value);
  setAiStatus(`AI URL сохранён: ${value}`);
}

function initAiCoach() {
  if (elements.aiBaseUrlInput) {
    elements.aiBaseUrlInput.value = localStorage.getItem(AI_BASE_STORAGE) || "";
  }
  loadPendingAiPlan();
  renderAiChat();
  setAiStatus(getAiApiKey() ? "" : "Ключ AI — в Кабинете, без входа и лимитов.");
}

function setAiStatus(text) {
  elements.aiStatus.textContent = text;
}

function loadAiChat() {
  try {
    const saved = JSON.parse(localStorage.getItem(AI_CHAT_STORAGE));
    return Array.isArray(saved) ? saved.filter((m) => m?.role && m?.content) : [];
  } catch {
    return [];
  }
}

function persistAiChat() {
  aiChat = aiChat.slice(-AI_CHAT_HISTORY_LIMIT);
  localStorage.setItem(AI_CHAT_STORAGE, JSON.stringify(aiChat));
}

function clearAiChat() {
  aiChat = [];
  localStorage.removeItem(AI_CHAT_STORAGE);
  aiError = "";
  dropPendingAiPlan();
  renderAiChat();
  setAiStatus("");
}

let aiThinking = false;
let aiError = "";

// План от AI сначала попадает сюда и ждёт кнопки «Принять»: сам он ничего не меняет.
let pendingAiPlan = null;

function loadPendingAiPlan() {
  try {
    const saved = JSON.parse(localStorage.getItem(AI_PENDING_PLAN_KEY));
    pendingAiPlan = Array.isArray(saved?.exercises) && saved.exercises.length ? saved : null;
  } catch {
    pendingAiPlan = null;
  }
  if (!pendingAiPlan) localStorage.removeItem(AI_PENDING_PLAN_KEY);
}

function storePendingAiPlan(plan) {
  pendingAiPlan = plan;
  localStorage.setItem(AI_PENDING_PLAN_KEY, JSON.stringify(plan));
}

function dropPendingAiPlan() {
  pendingAiPlan = null;
  localStorage.removeItem(AI_PENDING_PLAN_KEY);
}

function pendingPlanLines(plan) {
  return (plan?.exercises || []).map((item, index) => {
    const exercise = findExercise(item.exerciseId);
    const sets = (item.sets || [])
      .map((set) => `${formatNumber(set.weight)}×${set.reps}${set.rpe ? ` @ RPE ${set.rpe}` : ""}`)
      .join(", ");
    return `${index + 1}. ${exercise?.name || item.exerciseId}: ${sets}`;
  });
}

function describePendingPlanForChat() {
  if (!pendingAiPlan) return "";
  return ["Предлагаю такой план:", ...pendingPlanLines(pendingAiPlan)].join("\n");
}

function pendingPlanCard() {
  if (!pendingAiPlan) return "";
  const rows = pendingPlanLines(pendingAiPlan)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");
  return `
    <div class="ai-plan-offer">
      <p class="ai-plan-offer-title">Новый план ждёт подтверждения</p>
      ${pendingAiPlan.notes ? `<p class="ai-plan-offer-note">${escapeHtml(pendingAiPlan.notes)}</p>` : ""}
      <ol class="ai-plan-offer-list">${rows}</ol>
      <div class="ai-plan-offer-actions">
        <button class="button" type="button" data-ai-plan="accept">Принять план</button>
        <button class="button ghost" type="button" data-ai-plan="decline">Отклонить</button>
      </div>
    </div>
  `;
}

function acceptPendingAiPlan() {
  if (!pendingAiPlan) return;

  const valid = pendingAiPlan.exercises.filter((item) => findExercise(item.exerciseId));
  if (!valid.length) {
    dropPendingAiPlan();
    renderAiChat();
    showToast("В плане нет знакомых упражнений", "warn");
    return;
  }

  selected = valid.map((item) =>
    planEntry(item.exerciseId, (item.sets || []).map((set) => [set.weight, set.reps, set.rpe ?? ""]))
  );
  if (pendingAiPlan.notes) elements.notesInput.value = pendingAiPlan.notes;

  dropPendingAiPlan();
  renderSelectedExercises();
  persistAiPlan();
  saveWorkoutDraft();
  localStorage.removeItem(AI_POST_WORKOUT_PENDING_KEY);
  render();
  aiChat.push({ role: "assistant", content: "План принят — он уже на главной." });
  persistAiChat();
  renderAiChat();
  setAiStatus("План принят — он на главной.");
  showToast("План принят ✓");
}

function declinePendingAiPlan() {
  if (!pendingAiPlan) return;
  dropPendingAiPlan();
  localStorage.removeItem(AI_POST_WORKOUT_PENDING_KEY);
  aiChat.push({ role: "assistant", content: "План отклонён. Скажи, что поменять — предложу другой." });
  persistAiChat();
  renderAiChat();
  setAiStatus("План отклонён. Скажи, что поменять.");
  showToast("План отклонён");
}

function aiErrorBubble() {
  return `
    <div class="ai-msg ai-msg-bot ai-msg-error">
      <p>Не получилось: ${escapeHtml(aiError)}</p>
      <button class="button secondary ai-retry-button" type="button">Повторить</button>
    </div>
  `;
}

function aiTypingBubble() {
  return `
    <div class="ai-msg ai-msg-bot ai-msg-typing" aria-label="Тренер печатает">
      <span></span><span></span><span></span>
    </div>
  `;
}

function renderAiChat() {
  if (!aiChat.length && !aiThinking) {
    elements.aiChatLog.innerHTML = `
      <div class="ai-chat-empty">
        Это твой AI-тренер: он сам смотрит историю тренировок и план в приложении.
        Примеры: «оцени последнюю тренировку», «дай фидбэк по неделе», «запланируй следующую»,
        «замени жим ногами», «добавь упражнение на спину», «сделай план полегче».
      </div>
    ` + pendingPlanCard();
    return;
  }

  const bubbles = aiChat
    .map((message) => {
      const body = escapeHtml(message.content).replace(/\n/g, "<br>");
      return `<div class="ai-msg ${message.role === "user" ? "ai-msg-user" : "ai-msg-bot"}">${body}</div>`;
    })
    .join("");
  elements.aiChatLog.innerHTML =
    bubbles + (aiThinking ? aiTypingBubble() : aiError ? aiErrorBubble() : pendingPlanCard());
  scrollAiChatToBottom();
}

// Лента не всегда прокручивается сама (страница может скроллиться целиком),
// поэтому двигаем последний пузырь и оставляем место под липким полем ввода.
function scrollAiChatToBottom() {
  const log = elements.aiChatLog;
  const last = log?.lastElementChild;
  if (!last) return;
  const composer = document.querySelector(".ai-chat-composer");
  const run = () => {
    last.style.scrollMarginBottom = `${(composer?.offsetHeight || 120) + 24}px`;
    log.scrollTop = log.scrollHeight;
    last.scrollIntoView({ block: "end" });
  };
  run();
  window.requestAnimationFrame(run);
  window.setTimeout(run, 220);
}

const AI_SYSTEM_PROMPT = `Ты — персональный AI-тренер внутри приложения-трекера тренировок. Ты общаешься на русском, понимаешь разговорные и синонимичные формулировки: «оцени тренировку» = «дай фидбэк» = «разбери сессию» = «как я отработал»; «запланируй» = «составь план» = «накидай тренировку» = «что делать в следующий раз»; «замени/поменяй/убери/добавь упражнение», «сделай легче/тяжелее/короче». Если просьба неоднозначна, задай один короткий уточняющий вопрос, иначе действуй сразу. Выполняй именно то, о чём попросили: если просят добавить упражнение на конкретную группу мышц — добавь упражнение именно этой группы, даже если она уже есть в плане. Синонимы групп: «пресс/живот/кор» → Кор (dead-bug, ab-wheel, plank, side-plank, bird-dog, overhead-plate); «спина» → тяги и гравитрон; «ноги» → жим ногами, сгибание/разгибание ног, выпады; «грудь» → жимы и баттерфляй; «плечи» → жим вверх, дельта-машина; «руки» → бицепс, трицепс.

МОЖНО ОТВЕЧАТЬ НА ЛЮБЫЕ ВОПРОСЫ ПОЛЬЗОВАТЕЛЯ. Для вопросов о тренировках, здоровье, питании, восстановлении и плане используй контекст приложения и инструменты, когда это уместно. Для прочих тем отвечай как обычный полезный AI-помощник; не вызывай тренировочные инструменты, если они не нужны.

ПРОФИЛЬ АТЛЕТА: мужчина, тренируется в зале 2-3 раза в неделю на тренажёрах, гантелях и штанге. Цель — форма, самочувствие и сила без выгорания и без работы в отказ. Не любит farmer-carry. В зале есть гравитрон, жимы/тяги на тренажёрах, Belt Squat, Glute Drive, Hip&Glute, сгибания/разгибания ног, пресс/вращение корпуса, кардио (эллипс, вело, гребля, степпер, аэробайк), канаты, плюс свободные веса, перекладина, брусья, резинки и мячи — бери упражнения только из «Моего зала» / get_exercise_catalog. История знает случаи перегруза ЦНС, боли в левом плече и эпизод с правым коленом на жиме ногами — следи за этими сигналами. Если в контексте есть данные Mi Band (сон, пульс покоя, пульс сессии) — учитывай их в нагрузке: короткий сон или высокий пульс покоя = легче, без героизма.

ИНСТРУМЕНТЫ: у тебя есть функции. Прежде чем оценивать тренировку или менять план — ВСЕГДА сначала прочитай данные: get_recent_workouts (история), get_planned_workout (текущий план и статус тренировки), get_exercise_catalog (доступные упражнения и их id). Для последней тренировки и ближайшего плана запрашивай подробные 3–12 сессий через count. Для вопросов о прогрессе, плато, рекордах, балансе нагрузки и долгосрочном планировании дополнительно вызывай get_recent_workouts с days: 365 — он вернёт компактную историю за год. Полную замену плана делай через set_planned_workout, точечное добавление одного упражнения — через add_exercise_to_plan. ВАЖНО: set_planned_workout НЕ меняет план сразу — он показывает предложение с кнопкой «Принять план», и пользователь решает сам. Поэтому после вызова не пиши «план сохранён/обновлён»; скажи, что предложил план и ждёшь подтверждения. add_exercise_to_plan применяется сразу, потому что о нём просят явно. Используй только exerciseId из каталога. На оффтоп-запросах инструменты не вызывай.

НОВЫЕ УПРАЖНЕНИЯ: если пользователь встретил в зале тренажёр или упражнение, которого нет в каталоге («тут стоит хаммер», «добавь тягу Т-грифа», «есть новый тренажёр на икры»), — добавь его через add_new_exercise (подбери группу, единицу и шаг веса), а затем, если уместно, сразу поставь в текущую тренировку через add_exercise_to_plan с консервативными весами для первого знакомства (RPE 6-7, «прощупать» вес).

ВО ВРЕМЯ АКТИВНОЙ ТРЕНИРОВКИ (статус «тренировка идёт»): не вызывай set_planned_workout — он перезапишет отметки уже сделанных подходов. Добавляй через add_exercise_to_plan, а изменения существующих упражнений проговаривай словами.

МЕТОДИКА (научная база: позиция ACSM и мета-анализы по гипертрофии/силе):
- Объём: 10-20 рабочих подходов на мышечную группу в неделю, 2-3 подхода на упражнение, 8-20 повторов (в основном 6-12). Больше 20 подходов в неделю на группу — убывающая отдача.
- Интенсивность: рабочие подходы RPE 6-8 (2-4 повтора в запасе). RPE 9-10 и отказ — только как редкое исключение, не планируй их.
- Прогрессия: дабл-прогрессия — сначала +1-2 повтора в диапазоне, затем +2.5 кг (ноги +5-10 кг) и назад к нижней границе повторов. Прогресс только если RPE ≤ 8 и техника чистая.
- Восстановление: мышечной группе 48+ часов между тяжёлыми сессиями; отдых между подходами 2-3 мин на базовых.
- Разгрузка: каждые 4-6 недель или при сигналах усталости (растущий RPE при тех же весах, плохой сон, нет желания идти в зал, itог too-hard) — неделя с −30-50% объёма.
- Боль: при острой боли убрать провоцирующее движение, подобрать безболевую замену; при повторяющейся боли посоветовать врача. Дискомфорт в левом плече → осторожнее с жимами над головой и глубоким жимом.

СТИЛЬ ОТВЕТА: кратко, для чтения с телефона. 2-6 коротких абзацев или строк, без markdown-разметки (#, *, -, **). Конкретные цифры: веса, повторы, целевой RPE. Хвали за реальный прогресс, честно указывай на риски (пики RPE 9-10, лишний объём, слишком частые тренировки одной группы).`;

const AI_TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "get_recent_workouts",
      description: "История тренировок. С параметром count возвращает подробно последние 1–12 сессий. С параметром days возвращает компактную историю за период до 365 дней; используй days=365 для прогресса, плато, рекордов и долгосрочного планирования.",
      parameters: {
        type: "object",
        properties: {
          count: { type: "integer", description: "Сколько последних тренировок вернуть, 1-12. По умолчанию 3." },
          days: { type: "integer", description: "Период компактной истории в днях, 1-365. Если указан, имеет приоритет над count." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_planned_workout",
      description: "Текущий план следующей тренировки в приложении: дата, заметка-фокус, упражнения и целевые подходы.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_exercise_catalog",
      description: "Каталог доступных упражнений: exerciseId, название, группа мышц, единица веса. Только эти exerciseId можно использовать в set_planned_workout.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "add_new_exercise",
      description: "Добавляет новое упражнение в каталог приложения (например незнакомый тренажёр, которого нет в get_exercise_catalog). Возвращает exerciseId нового упражнения — после этого его можно ставить в план.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Название по-русски, как его увидит пользователь. Например: «Хаммер жим сидя»." },
          group: { type: "string", enum: ["Ноги", "Икры", "Спина", "Грудь", "Плечи", "Задняя цепь", "Функционал", "Руки", "Кор", "Плиометрика", "Кардио", "Другое"], description: "Группа мышц/тип." },
          unit: { type: "string", description: "Единица нагрузки: «кг», «кг/рука», «кг противовес», «мин», «повторы». По умолчанию «кг»." },
          step: { type: "number", description: "Шаг изменения веса в кг (обычно 2.5; для тренажёров с большими плитками 5)." },
        },
        required: ["name", "group"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_exercise_to_plan",
      description: "Добавляет ОДНО упражнение с подходами в конец текущего плана/тренировки, не трогая остальные упражнения и отметки выполнения. Используй для точечных добавлений, особенно когда тренировка уже идёт.",
      parameters: {
        type: "object",
        properties: {
          exerciseId: { type: "string", description: "id из get_exercise_catalog или из ответа add_new_exercise" },
          sets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                weight: { type: "number", description: "Вес в кг (для кардио — минуты)" },
                reps: { type: "integer", description: "Повторы (для кардио — 1)" },
                rpe: { type: "number", description: "Целевой RPE 5-8" },
              },
              required: ["weight", "reps"],
            },
          },
        },
        required: ["exerciseId", "sets"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_planned_workout",
      description: "Полностью заменяет план следующей тренировки в приложении (упражнения, подходы, целевые RPE, заметку). Вызывай, когда пользователь попросил запланировать или изменить тренировку.",
      parameters: {
        type: "object",
        properties: {
          notes: { type: "string", description: "Короткая заметка-фокус тренировки (1-2 предложения, по-русски)." },
          exercises: {
            type: "array",
            description: "Упражнения по порядку выполнения.",
            items: {
              type: "object",
              properties: {
                exerciseId: { type: "string", description: "id из get_exercise_catalog" },
                sets: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      weight: { type: "number", description: "Вес в кг (для кардио — минуты)" },
                      reps: { type: "integer", description: "Повторы (для кардио — 1)" },
                      rpe: { type: "number", description: "Целевой RPE 5-8" },
                    },
                    required: ["weight", "reps"],
                  },
                },
              },
              required: ["exerciseId", "sets"],
            },
          },
        },
        required: ["exercises"],
      },
    },
  },
];

function persistAiPlan() {
  localStorage.setItem(
    AI_PLAN_STORAGE,
    JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      planDate: elements.dateInput.value || formatInputDate(new Date()),
      notes: elements.notesInput.value,
      exercises: selected.map((item) => ({
        exerciseId: item.exerciseId,
        sets: item.sets.map((set) => ({ weight: set.weight, reps: set.reps, rpe: set.rpe })),
      })),
    })
  );
}

function applyStoredAiPlan() {
  let plan;
  try {
    plan = JSON.parse(localStorage.getItem(AI_PLAN_STORAGE));
  } catch {
    localStorage.removeItem(AI_PLAN_STORAGE);
    return;
  }
  if (!plan || plan.version !== 1 || !Array.isArray(plan.exercises) || !plan.exercises.length) return;

  // План выполнен: после его сохранения появилась тренировка на эту дату или позже.
  const planDate = plan.planDate || formatInputDate(new Date(plan.savedAt || Date.now()));
  if (state.workouts.some((workout) => workout.date >= planDate)) {
    localStorage.removeItem(AI_PLAN_STORAGE);
    return;
  }

  const valid = plan.exercises.filter((item) => findExercise(item.exerciseId));
  if (!valid.length) return;

  selected = valid.map((item) =>
    planEntry(item.exerciseId, (item.sets || []).map((set) => [set.weight, set.reps, set.rpe ?? ""]))
  );
  if (typeof plan.notes === "string" && plan.notes.trim()) {
    elements.notesInput.value = plan.notes;
  }
  if (planDate >= formatInputDate(new Date())) {
    elements.dateInput.value = planDate;
  }
}

function describeWorkoutForAi(workout) {
  const durationMinutes = workout.durationMinutes ||
    (workout.durationMs ? Math.max(1, Math.round(workout.durationMs / 60000)) : null);
  const header = `${workout.date} · готовность: ${workout.readiness || "?"} · итог: ${workout.sessionEffort || "?"}${durationMinutes ? ` · ${durationMinutes} мин` : ""}`;
  const lines = (workout.exercises || []).map((item) => {
    const exercise = findExercise(item.exerciseId);
    const sets = (item.sets || [])
      .map((set) => {
        const status = set.done === false ? "не сделан" : "сделан";
        const mark = setMarkLabel(set.mark || "normal");
        return `${formatNumber(set.weight)}x${set.reps}${set.rpe ? `@${set.rpe}` : ""} (${status}, метка: ${mark})`;
      })
      .join(", ");
    return `  - ${exercise ? exercise.name : item.exerciseId}: ${sets}`;
  });
  return [
    header,
    workout.notes ? `  заметки до: ${workout.notes}` : null,
    workout.afterNotes ? `  заметки после: ${workout.afterNotes}` : null,
    wearableReportLine(workout.wearable) ? `  ${wearableReportLine(workout.wearable)}` : null,
    ...lines,
  ].filter(Boolean).join("\n");
}

function bestSetForAi(item, exercise) {
  const completed = (item.sets || []).filter((set) => set.done !== false);
  const sets = completed.length ? completed : (item.sets || []);
  return sets.reduce((best, set) => {
    if (!best) return set;
    if (exercise?.lowerIsBetter) {
      return Number(set.weight) < Number(best.weight) ? set : best;
    }
    return Number(set.weight) > Number(best.weight) ||
      (Number(set.weight) === Number(best.weight) && Number(set.reps) > Number(best.reps))
      ? set
      : best;
  }, null);
}

function setForAi(set) {
  return set
    ? `${formatNumber(set.weight)}x${set.reps}${set.rpe ? `@${set.rpe}` : ""}`
    : "нет данных";
}

function buildPeriodHistoryForAi(period, days) {
  const monthly = new Map();
  const byExercise = new Map();
  const safetyNotes = [];

  period.forEach((workout) => {
    const month = workout.date.slice(0, 7);
    const monthStats = monthly.get(month) || { sessions: 0, sets: 0, rpes: [] };
    monthStats.sessions += 1;
    monthStats.sets += workoutSetCount(workout);
    monthStats.rpes.push(...(workout.exercises || []).flatMap((item) =>
      (item.sets || []).map((set) => Number(set.rpe)).filter(Boolean)
    ));
    monthly.set(month, monthStats);

    (workout.exercises || []).forEach((item) => {
      const exercise = findExercise(item.exerciseId);
      const representative = bestSetForAi(item, exercise);
      if (!representative) return;
      const stats = byExercise.get(item.exerciseId) || {
        exercise,
        sessions: 0,
        first: null,
        latest: null,
        best: null,
        rpes: [],
      };
      const point = { date: workout.date, set: representative };
      stats.sessions += 1;
      stats.first ||= point;
      stats.latest = point;
      stats.rpes.push(...(item.sets || []).map((set) => Number(set.rpe)).filter(Boolean));
      if (!stats.best) {
        stats.best = point;
      } else {
        const current = stats.best.set;
        const better = exercise?.lowerIsBetter
          ? Number(representative.weight) < Number(current.weight)
          : Number(representative.weight) > Number(current.weight) ||
            (Number(representative.weight) === Number(current.weight) &&
              Number(representative.reps) > Number(current.reps));
        if (better) stats.best = point;
      }
      byExercise.set(item.exerciseId, stats);
    });

    const note = [workout.notes, workout.afterNotes].filter(Boolean).join(" | ");
    if (note && /бол|колен|плеч|травм|пульс|голов|цнс|перегруз|отказ|rpe\s*(?:9|10)|тяжел|плохо/i.test(note)) {
      safetyNotes.push(`${workout.date}: ${note.slice(0, 220)}`);
    }
  });

  const monthLines = [...monthly.entries()].map(([month, stats]) =>
    `${month}: ${stats.sessions} сесс., ${stats.sets} подх., ср.RPE ${
      stats.rpes.length ? average(stats.rpes).toFixed(1) : "н/д"
    }`
  );
  const exerciseLines = [...byExercise.values()]
    .sort((a, b) => b.sessions - a.sessions)
    .map((stats) =>
      `${stats.exercise?.name || "Упражнение"}: ${stats.sessions} сесс.; ` +
      `старт ${stats.first.date} ${setForAi(stats.first.set)}; ` +
      `последний ${stats.latest.date} ${setForAi(stats.latest.set)}; ` +
      `лучший ${stats.best.date} ${setForAi(stats.best.set)}; ` +
      `ср.RPE ${stats.rpes.length ? average(stats.rpes).toFixed(1) : "н/д"}`
    );
  const timeline = period.map((workout) => {
    const rpes = (workout.exercises || []).flatMap((item) =>
      (item.sets || []).map((set) => Number(set.rpe)).filter(Boolean)
    );
    return `${workout.date}(${workout.readiness || "?"}/${workout.sessionEffort || "?"},` +
      `${workoutSetCount(workout)}п,RPE${rpes.length ? average(rpes).toFixed(1) : "?"})`;
  });

  return [
    `История за ${days} дней: ${period.length} тренировок, ${period[0].date} — ${period.at(-1).date}.`,
    `Хронология всех сессий: ${timeline.join(" ")}`,
    "Помесячная нагрузка:",
    ...monthLines,
    "Прогресс по упражнениям:",
    ...exerciseLines,
    ...(safetyNotes.length ? ["Важные заметки о боли/усталости:", ...safetyNotes.slice(-20)] : []),
  ].join("\n").slice(0, 15800);
}

function executeAiTool(name, args) {
  if (name === "get_recent_workouts") {
    const requestedDays = Number(args.days);
    if (Number.isFinite(requestedDays) && requestedDays > 0) {
      const days = Math.min(Math.max(Math.round(requestedDays), 1), 365);
      const latestDate = state.workouts.at(-1)?.date || formatInputDate(new Date());
      const cutoff = new Date(`${latestDate}T00:00:00`);
      cutoff.setDate(cutoff.getDate() - days + 1);
      const cutoffDate = formatInputDate(cutoff);
      const period = state.workouts.filter((workout) => workout.date >= cutoffDate && workout.date <= latestDate);
      if (!period.length) return `За последние ${days} дней сохранённых тренировок нет.`;
      return buildPeriodHistoryForAi(period, days);
    }

    const count = Math.min(Math.max(Number(args.count) || 3, 1), 12);
    const recent = state.workouts.slice(-count).map(describeWorkoutForAi);
    return recent.length ? recent.join("\n\n") : "Сохранённых тренировок нет.";
  }

  if (name === "get_planned_workout") {
    const plan = selected.map((item) => {
      const exercise = findExercise(item.exerciseId);
      const sets = item.sets
        .map((set) => `${formatNumber(set.weight)}x${set.reps}${set.rpe ? `@${set.rpe}` : ""}${set.done ? " ✓" : ""}`)
        .join(", ");
      return `- ${exercise ? exercise.name : item.exerciseId} (${item.exerciseId}): ${sets}`;
    });
    const isActive = elements.workoutPanel.classList.contains("is-active");
    const upcoming = [];
    const start = new Date();
    for (let i = 0; i < 30 && upcoming.length < 5; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const iso = formatInputDate(date);
      if (isPlannedDate(iso)) upcoming.push(iso);
    }
    return [
      `Статус: ${isActive ? "тренировка идёт прямо сейчас (✓ = подход уже сделан)" : "тренировка ещё не начата"}`,
      `Дата: ${elements.dateInput.value || "не выбрана"}`,
      `Календарь пользователя (ближайшие запланированные дни): ${upcoming.length ? upcoming.join(", ") : "пусто — дни не отмечены"}`,
      `Заметка: ${elements.notesInput.value || "нет"}`,
      `Mi Band: ${formatWearableLine(wearableApi()?.loadSnapshot?.()) || "нет свежих данных"}`,
      "Упражнения:",
      plan.join("\n") || "план пуст",
    ].join("\n");
  }

  if (name === "add_new_exercise") {
    const title = (args.name || "").trim();
    if (!title) return "Ошибка: не указано название упражнения.";

    const existing = exercises.find((exercise) => exercise.name.toLowerCase() === title.toLowerCase());
    if (existing) {
      return `Такое упражнение уже есть в каталоге: ${existing.id} — ${existing.name} (${existing.group}). Используй его.`;
    }

    const exercise = addCustomExercise({ name: title, group: args.group, unit: args.unit, step: args.step });
    return `Добавил в каталог: ${exercise.id} — ${exercise.name} (${exercise.group}, ${exercise.unit}). Теперь можно ставить его в план.`;
  }

  if (name === "add_exercise_to_plan") {
    const exercise = exercises.find((item) => item.id === args.exerciseId);
    if (!exercise) {
      return `Ошибка: неизвестный exerciseId «${args.exerciseId}». Возьми id из get_exercise_catalog или сначала добавь упражнение через add_new_exercise.`;
    }

    const rows = (Array.isArray(args.sets) ? args.sets : [])
      .map((set) => [Number(set.weight) || 0, Number(set.reps) || 0, set.rpe ? Number(set.rpe) : ""])
      .filter((row) => row[1] > 0);
    if (!rows.length) return "Ошибка: не переданы подходы (weight, reps).";

    selected.push(planEntry(exercise.id, rows));
    renderSelectedExercises();
    persistAiPlan();
    saveWorkoutDraft();
    return `Добавил в текущий план: ${exercise.name}, ${rows.length} подх. Остальные упражнения не тронуты.`;
  }

  if (name === "get_exercise_catalog") {
    const available = exercises.filter((exercise) => isExerciseAvailable(exercise));
    const hiddenCount = exercises.length - available.length;
    const lines = available.map((exercise) => `${exercise.id} — ${exercise.name} (${exercise.group}, ${exercise.unit})`);
    if (hiddenCount > 0) {
      lines.push(
        `\nЕщё ${hiddenCount} упражнений скрыто настройкой «Мой зал» — этого оборудования в зале пользователя нет, НЕ предлагай их. Если нужно что-то новое, добавь через add_new_exercise.`
      );
    }
    return lines.join("\n");
  }

  if (name === "set_planned_workout") {
    const items = Array.isArray(args.exercises) ? args.exercises : [];
    if (!items.length) return "Ошибка: список упражнений пуст, план не изменён.";

    const unknown = items.filter((item) => !findExercise(item.exerciseId)).map((item) => item.exerciseId);
    if (unknown.length) {
      return `Ошибка: неизвестные exerciseId: ${unknown.join(", ")}. Возьми точные id из get_exercise_catalog и повтори вызов.`;
    }

    // План не применяется сам: пользователь подтверждает его кнопкой в чате.
    storePendingAiPlan({
      version: 1,
      createdAt: Date.now(),
      notes: typeof args.notes === "string" ? args.notes.trim() : "",
      exercises: items.map((item) => ({
        exerciseId: item.exerciseId,
        sets: (item.sets || []).map((set) => ({
          weight: Number(set.weight) || 0,
          reps: Number(set.reps) || 0,
          rpe: set.rpe ? Number(set.rpe) : "",
        })),
      })),
    });
    renderAiChat();

    const summary = pendingAiPlan.exercises
      .map((item) => `${findExercise(item.exerciseId).name}: ${item.sets.length} подх.`)
      .join("; ");
    return `План показан пользователю на подтверждение (${pendingAiPlan.exercises.length} упражнений): ${summary}. В приложении он ПОКА НЕ применён — не пиши, что план сохранён. Скажи, что ждёшь кнопку «Принять план».`;
  }

  return `Ошибка: неизвестный инструмент ${name}.`;
}

function proposedOrCurrentPlanText() {
  return describePendingPlanForChat() || describePlannedWorkoutForChat();
}

function describePlannedWorkoutForChat() {
  if (!selected.length) return "";
  const rows = selected.map((item, index) => {
    const exercise = findExercise(item.exerciseId);
    const sets = item.sets
      .map((set) => `${formatNumber(set.weight)}×${set.reps}${set.rpe ? ` @ RPE ${set.rpe}` : ""}`)
      .join(", ");
    return `${index + 1}. ${exercise?.name || item.exerciseId}: ${sets}`;
  });
  return [
    `План на ${formatDate(elements.dateInput.value)} сохранён на главной:`,
    ...rows,
    elements.notesInput.value ? `Фокус: ${elements.notesInput.value}` : "",
  ].filter(Boolean).join("\n");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOpenAiDirect(key, messages, tools, toolChoice) {
  const maxAttempts = 3;
  const payload = {
    model: AI_MODEL,
    temperature: 0.4,
    max_completion_tokens: 900,
    reasoning_effort: "none",
    messages: [
      { role: "system", content: `${AI_SYSTEM_PROMPT}\n\nСегодня ${formatInputDate(new Date())}.` },
      ...messages,
    ],
    tools,
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;
    try {
      response = await fetch(`${getAiBaseUrl()}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(payload),
      });
    } catch {
      if (attempt < maxAttempts) {
        setAiStatus(`Связь прервалась, пробую ещё раз (${attempt + 1}/${maxAttempts})…`);
        await sleep(1200 * attempt);
        continue;
      }
      const usingDefault = getAiBaseUrl() === AI_DEFAULT_BASE_URL;
      throw new Error(
        usingDefault
          ? "нет доступа к OpenAI. Из России нужен VPN или прокси-URL в Кабинете"
          : "нет связи с AI-сервером. Проверь интернет и адрес прокси в Кабинете"
      );
    }

    if (response.status === 401) throw new Error("неверный API key");
    if (response.status === 403) {
      throw new Error("доступ запрещён (403): включи VPN или укажи прокси-URL в Кабинете");
    }
    if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
      setAiStatus(`OpenAI занят, пробую ещё раз (${attempt + 1}/${maxAttempts})…`);
      await sleep(1500 * attempt);
      continue;
    }
    if (!response.ok) throw new Error(`API вернул ${response.status}`);
    return response.json();
  }

  throw new Error("OpenAI не отвечает, попробуй чуть позже");
}

async function callOpenAi(messages, toolChoice, deferredTool = "") {
  const tools = toolChoice
    ? AI_TOOL_DEFS.filter((tool) => tool.function.name === toolChoice.function.name)
    : AI_TOOL_DEFS.filter((tool) => tool.function.name !== deferredTool);
  const key = getAiApiKey();
  if (key) return callOpenAiDirect(key, messages, tools, toolChoice);

  if (window.cloudSync?.callAi) {
    try {
      return await window.cloudSync.callAi(messages, tools, toolChoice);
    } catch (error) {
      if (error?.status === 429) throw new Error("AI временно перегружен, попробуй ещё раз чуть позже");
    }
  }

  throw new Error("Сначала сохрани OpenAI API key в Кабинете. Вход не нужен.");
}

async function runAiConversation({ requiredTool = "", onIntermediateText } = {}) {
  const messages = [
    ...aiChat.slice(-AI_CHAT_HISTORY_LIMIT).map((message) => ({ role: message.role, content: message.content })),
  ];
  const requiredReads = ["get_recent_workouts", "get_planned_workout", "get_exercise_catalog"];
  const completedReads = new Set();
  let requiredToolApplied = false;
  let requiredToolResult = "";
  let pendingText = "";
  let intermediateTextShown = false;

  for (let round = 0; round < AI_MAX_TOOL_ROUNDS; round++) {
    const canForceRequiredTool =
      requiredTool &&
      !requiredToolApplied &&
      pendingText &&
      requiredReads.every((name) => completedReads.has(name));
    const toolChoice = canForceRequiredTool
      ? { type: "function", function: { name: requiredTool } }
      : undefined;
    // В автоматическом сценарии write-tool скрыт, пока AI не прочитал данные
    // и не сформулировал фидбэк. После этого остаётся только обязательная запись плана.
    const data = await callOpenAi(messages, toolChoice, requiredTool);
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error("пустой ответ модели");

    if (message.tool_calls?.length) {
      messages.push(message);
      for (const call of message.tool_calls) {
        let result;
        try {
          result = executeAiTool(call.function.name, JSON.parse(call.function.arguments || "{}"));
        } catch (error) {
          result = `Ошибка инструмента: ${error.message}`;
        }
        if (requiredReads.includes(call.function.name)) completedReads.add(call.function.name);
        if (
          call.function.name === requiredTool &&
          !String(result).startsWith("Ошибка:")
        ) {
          requiredToolApplied = true;
          requiredToolResult = result;
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
      if (requiredToolApplied && pendingText) {
        const planText = proposedOrCurrentPlanText();
        return intermediateTextShown ? planText : `${pendingText}\n\n${planText}`;
      }
      continue;
    }

    const text = (message.content || "").trim();
    if (text && requiredTool && !requiredToolApplied) {
      messages.push(message);
      const missingReads = requiredReads.filter((name) => !completedReads.has(name));
      if (!missingReads.length) {
        pendingText = text;
        if (typeof onIntermediateText === "function") {
          onIntermediateText(text);
          intermediateTextShown = true;
        }
      }
      messages.push({
        role: "user",
        content: missingReads.length
          ? `Продолжи выполнение запроса: сначала вызови ${missingReads.join(", ")}, затем обязательно ${requiredTool}. Не завершай ответ одним текстом.`
          : `Продолжи выполнение запроса и обязательно вызови ${requiredTool}. План должен быть сохранён в приложении, текста недостаточно.`,
      });
      continue;
    }
    if (text) {
      return requiredToolApplied
        ? `${text}\n\n${proposedOrCurrentPlanText()}`
        : text;
    }
    throw new Error("пустой ответ модели");
  }

  if (requiredToolApplied) {
    const planText = proposedOrCurrentPlanText() || requiredToolResult;
    return intermediateTextShown ? planText : [pendingText, planText].filter(Boolean).join("\n\n");
  }
  throw new Error("слишком много шагов, сформулируй запрос проще");
}

async function sendAiChatMessage() {
  const text = elements.aiChatInput.value.trim();
  if (!text) return;

  aiChat.push({ role: "user", content: text });
  persistAiChat();
  renderAiChat();
  elements.aiChatInput.value = "";
  await runAiChatCycle();
}

async function retryAiChat() {
  if (!aiChat.length || aiChat.at(-1).role !== "user") return;
  await runAiChatCycle();
}

function createFallbackNextWorkoutPlan() {
  const result = buildWorkoutFromGoal("fullbody", 45);
  if (!result?.plan?.length) return "";

  storePendingAiPlan({
    version: 1,
    createdAt: Date.now(),
    notes: "Резервный план: фулбади ~45 мин, RPE 6–8, без отказа. Вес и ротация подобраны по истории.",
    exercises: result.plan.map((item) => ({
      exerciseId: item.exerciseId,
      sets: item.sets.map((set) => ({ weight: set.weight, reps: set.reps, rpe: set.rpe ?? "" })),
    })),
  });
  renderAiChat();
  return [
    `AI не смог записать план инструментом, поэтому приложение собрало резервный вариант по твоей истории, нагрузке и упражнениям «Моего зала». Посмотри и нажми «Принять план», если подходит.`,
    describePendingPlanForChat(),
  ].join("\n\n");
}

// После завершения тренировки остаёмся в AI-чате: там видны фидбэк и описание
// сохранённого плана, а сам план уже доступен на главной.
async function autoAiAfterWorkout() {
  window.showAppView?.("ai");
  aiChat.push({
    role: "user",
    content: "Я только что закончил тренировку. Проанализируй выполненные и пропущенные подходы, веса, повторы, RPE, отметки, готовность, итоговое самочувствие, мои заметки, недавнюю нагрузку и прогресс. Дай короткий фидбэк. Затем с учётом восстановления, календаря и доступных упражнений «Моего зала» собери и сохрани следующую тренировку, после чего кратко опиши её.",
  });
  persistAiChat();
  renderAiChat();
  await runAiChatCycle({
    requiredTool: "set_planned_workout",
    onIntermediateText: (feedback) => {
      aiChat.push({ role: "assistant", content: feedback });
      persistAiChat();
      renderAiChat();
    },
  });

  if (!pendingAiPlan && !selected.length) {
    const fallbackMessage = createFallbackNextWorkoutPlan();
    if (fallbackMessage) {
      aiChat.push({ role: "assistant", content: fallbackMessage });
      persistAiChat();
      renderAiChat();
    }
  }

  if (pendingAiPlan) {
    setAiStatus("Посмотри план и нажми «Принять», если подходит.");
    showToast("Новый план ждёт подтверждения");
  }
}

let aiPlanningRecoveryRunning = false;

function pendingWorkoutForAiPlanning() {
  if (pendingAiPlan || selected.length || !state.workouts.length) return null;

  try {
    const pending = JSON.parse(localStorage.getItem(AI_POST_WORKOUT_PENDING_KEY));
    if (pending?.workoutId || pending?.workoutDate) {
      return state.workouts.find((workout) =>
        workout.id === pending.workoutId || workout.date === pending.workoutDate
      ) || state.workouts.at(-1);
    }
  } catch {
    localStorage.removeItem(AI_POST_WORKOUT_PENDING_KEY);
  }

  // Восстанавливаем один раз сценарий, оборванный в v120 и более ранних версиях:
  // в чате уже есть автозапрос после тренировки, но сохранённого плана ещё нет.
  let autoRequestIndex = -1;
  for (let index = aiChat.length - 1; index >= 0; index -= 1) {
    const message = aiChat[index];
    if (message.role === "user" && /только что закончил тренировку/i.test(message.content)) {
      autoRequestIndex = index;
      break;
    }
  }
  if (autoRequestIndex < 0) return null;
  // Сценарий закрыт, если план уже сохранён (старые версии) или по нему принято решение.
  const planWasHandled = aiChat.slice(autoRequestIndex + 1).some((message) =>
    message.role === "assistant" &&
    /план на .+ сохран[её]н на главной|план принят|план отклон[её]н/i.test(message.content)
  );
  if (planWasHandled) return null;

  const latest = state.workouts.at(-1);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 2);
  return latest.date >= formatInputDate(cutoff) ? latest : null;
}

async function resumeAiPlanningIfNeeded() {
  if (
    aiPlanningRecoveryRunning ||
    !pendingWorkoutForAiPlanning()
  ) {
    return;
  }

  aiPlanningRecoveryRunning = true;
  try {
    await autoAiAfterWorkout();
  } finally {
    aiPlanningRecoveryRunning = false;
  }
}

async function runAiChatCycle(options = {}) {
  elements.aiChatSendButton.disabled = true;
  aiThinking = true;
  aiError = "";
  renderAiChat();
  setAiStatus("Тренер смотрит твои данные…");

  try {
    const reply = await runAiConversation(options);
    aiChat.push({ role: "assistant", content: reply });
    persistAiChat();
    setAiStatus("");
    return true;
  } catch (error) {
    aiError = error.message || "нет связи с сервером";
    setAiStatus("");
    return false;
  } finally {
    aiThinking = false;
    elements.aiChatSendButton.disabled = false;
    renderAiChat();
  }
}

function nextSessionSuggestion(workouts, readiness, fatigue) {
  const items = [];
  const recentGroups = groupCounts(workouts.slice(-2));
  const pushedRecently = fatigue >= 7;

  if (readiness === "bad" || pushedRecently) {
    items.push({
      title: "Сегодня лучше лайт",
      text: "20-30 минут спокойного кардио, мобилити, кор без отказа. Если очень хочется железо: 2-3 упражнения по RPE 6-7.",
    });
  } else if ((recentGroups["Грудь"] || 0) + (recentGroups["Плечи"] || 0) > 4) {
    items.push({
      title: "Следующая тренировка: ноги + спина",
      text: "Жим ногами, гравитрон, горизонтальная тяга, сгибание ног, Dead Bug. Жимы оставить в покое.",
    });
  } else {
    items.push({
      title: "Следующая тренировка: полный корпус",
      text: "Один жим, одна тяга, одно упражнение на ноги, кор и короткое кардио. Почти все подходы держать на RPE 7-8.",
    });
  }

  items.push({
    title: `Индекс усталости: ${fatigue}/10`,
    text: fatigue >= 7
      ? "Слишком много тяжелых сигналов за последние тренировки. На этой неделе лучше снизить объем на 20-30%."
      : "Нагрузка выглядит терпимо. Прогрессировать можно маленькими шагами, без отказа.",
  });

  const progress = suggestProgressions(workouts).slice(0, 3);
  if (progress.length) {
    items.push({
      title: "Подсказки по весам",
      text: progress.join(" "),
    });
  }

  return items;
}

function suggestProgressions(workouts) {
  const latestByExercise = new Map();
  workouts.slice().reverse().forEach((workout) => {
    workout.exercises.forEach((item) => {
      if (!latestByExercise.has(item.exerciseId)) latestByExercise.set(item.exerciseId, item);
    });
  });

  return [...latestByExercise.entries()].map(([exerciseId, item]) => {
    const exercise = findExercise(exerciseId);
    if (exercise.cardio || exercise.bodyweight) return null;

    const best = bestSet(item);
    const avgRpe = average(item.sets.map((set) => set.rpe).filter(Boolean));
    if (!best || !avgRpe) return null;

    if (avgRpe <= 7.5) {
      const next = best.weight + exercise.step;
      return `${exercise.name}: можно попробовать ${formatNumber(next)} ${exercise.unit}.`;
    }

    if (avgRpe >= 9) {
      const next = best.weight - exercise.step;
      return `${exercise.name}: лучше откатить к ${formatNumber(next)} ${exercise.unit}.`;
    }

    return `${exercise.name}: повторить ${formatNumber(best.weight)} ${exercise.unit} и добрать качество.`;
  }).filter(Boolean);
}

function renderCharts() {
  const exerciseId = elements.chartExerciseSelect.value;
  const points = state.workouts
    .map((workout) => {
      const item = workout.exercises.find((exercise) => exercise.exerciseId === exerciseId);
      if (!item) return null;
      const best = bestSet(item);
      return {
        label: workout.date.slice(5),
        best: best ? best.weight : 0,
        volume: exerciseVolume(item),
      };
    })
    .filter(Boolean);

  elements.weightChart.innerHTML = points.length ? lineSvg(points.map((point) => point.best), points.map((point) => point.label)) : emptyChart("Пока нет данных по этому упражнению.");
  elements.volumeChart.innerHTML = points.length ? barSvg(points.map((point) => point.volume), points.map((point) => point.label)) : emptyChart("Пока нет данных по объему.");
}

function lineSvg(values, labels) {
  const width = 640;
  const height = 240;
  const padding = 34;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const points = values.map((value, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return [x, y];
  });

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="График лучшего веса">
      <path d="M ${padding} ${height - padding} H ${width - padding}" stroke="var(--line)" fill="none" />
      <path d="${points.map(([x, y], index) => `${index ? "L" : "M"} ${x} ${y}`).join(" ")}" stroke="var(--accent)" stroke-width="3" fill="none" />
      ${points.map(([x, y], index) => `<circle cx="${x}" cy="${y}" r="4" fill="var(--accent-2)"><title>${labels[index]}: ${formatNumber(values[index])}</title></circle>`).join("")}
      <text x="${padding}" y="22" fill="var(--muted)" font-size="12">Вес / помощь тренажера</text>
      <text x="${padding}" y="${height - 8}" fill="var(--muted)" font-size="12">Дата</text>
    </svg>
  `;
}

function barSvg(values, labels, chartHeight = 240, title = "Объем, кг x повторы") {
  const width = 640;
  const height = chartHeight;
  const padding = 34;
  const max = Math.max(...values, 1);
  const barWidth = (width - padding * 2) / Math.max(values.length, 1) - 8;

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="График объема нагрузки">
      <path d="M ${padding} ${height - padding} H ${width - padding}" stroke="var(--line)" fill="none" />
      ${values.map((value, index) => {
        const barHeight = (value / max) * (height - padding * 2);
        const x = padding + index * (barWidth + 8);
        const y = height - padding - barHeight;
        return `<rect x="${x}" y="${y}" width="${Math.max(barWidth, 4)}" height="${barHeight}" rx="5" fill="var(--accent)"><title>${labels[index]}: ${formatNumber(value)} кг</title></rect>`;
      }).join("")}
      <text x="${padding}" y="22" fill="var(--muted)" font-size="12">${title}</text>
      <text x="${padding}" y="${height - 8}" fill="var(--muted)" font-size="12">Дата</text>
    </svg>
  `;
}

function emptyChart(message) {
  return `<div class="empty">${message}</div>`;
}

function renderHistory() {
  const workouts = state.workouts
    .map((workout, index) => ({ workout, index }))
    .reverse()
    .slice(0, 8);
  elements.historyList.innerHTML = workouts.length
    ? workouts.map(({ workout, index }) => `
      <article class="history-item">
        <div class="history-header">
          <div class="history-meta">
            <strong>${formatDate(workout.date)}</strong>
            <span>${readinessLabel(workout.readiness)}</span>
            <span>${doneSetCount(workout)}/${workoutSetCount(workout)} подходов</span>
            <span>RPE ${averageWorkoutRpe(workout) || "n/a"}</span>
            ${workout.sessionEffort ? `<span>${sessionEffortLabel(workout.sessionEffort)}</span>` : ""}
            ${workout.wearable?.sessionTypeLabel ? `<span>${workout.wearable.sessionTypeLabel}</span>` : ""}
            ${workout.wearable?.calories ? `<span>${workout.wearable.calories} ккал</span>` : ""}
          </div>
        </div>
        ${workout.notes ? `<p>${escapeHtml(workout.notes)}</p>` : ""}
        ${workout.afterNotes ? `<p>${escapeHtml(workout.afterNotes)}</p>` : ""}
        <div class="history-exercises">
          ${workout.exercises.map((item) => `<span class="chip">${findExercise(item.exerciseId).name}: ${item.sets.length} п.</span>`).join("")}
        </div>
      </article>
    `).join("")
    : `<div class="empty">Пока пусто. Нажми “Загрузить пример” или сохрани сегодняшнюю тренировку.</div>`;
}

function bestExercisePerformance(workouts, exerciseId) {
  const exercise = findExercise(exerciseId);
  let best = null;

  workouts.forEach((workout) => {
    workout.exercises
      .filter((item) => item.exerciseId === exerciseId)
      .forEach((item) => {
        item.sets.forEach((set) => {
          if (!best) {
            best = { exercise, set, workout };
            return;
          }

          const better = exercise.lowerIsBetter
            ? Number(set.weight) < Number(best.set.weight)
            : Number(set.weight) > Number(best.set.weight) ||
              (Number(set.weight) === Number(best.set.weight) && Number(set.reps) > Number(best.set.reps));

          if (better) best = { exercise, set, workout };
        });
      });
  });

  return best;
}

function findExercise(id) {
  const resolved = EXERCISE_ALIASES[id] || id;
  return exercises.find((exercise) => exercise.id === resolved) || exercises[0];
}

function shortUnit(exercise) {
  const unit = exercise?.unit || "кг";
  if (unit === "кг противовес" || unit === "кг/рука" || unit === "кг в руках") return "кг";
  if (unit === "сек/повт") return "сек";
  return unit;
}

function workoutSetCount(workout) {
  return workout.exercises.reduce((sum, exercise) => {
    const meta = findExercise(exercise.exerciseId);
    if (meta.cardio) return sum;
    return sum + exercise.sets.length;
  }, 0);
}

function doneSetCount(workout) {
  return workout.exercises.reduce((sum, exercise) => {
    const meta = findExercise(exercise.exerciseId);
    if (meta.cardio) return sum;
    const done = exercise.sets.filter((set) => set.done || set.done === undefined).length;
    return sum + done;
  }, 0);
}

function exerciseVolume(exerciseEntry) {
  const exercise = findExercise(exerciseEntry.exerciseId);
  if (exercise.cardio) return 0;
  return exerciseEntry.sets.reduce((sum, set) => sum + Number(set.weight || 0) * Number(set.reps || 0), 0);
}

function bestSet(exerciseEntry) {
  return exerciseEntry.sets.reduce((best, set) => {
    if (!best || Number(set.weight) > Number(best.weight)) return set;
    return best;
  }, null);
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + Number(value), 0) / values.length;
}

function averageWorkoutRpe(workout) {
  const avg = average(workout.exercises.flatMap((exercise) => exercise.sets.map((set) => set.rpe).filter(Boolean)));
  return avg ? avg.toFixed(1) : null;
}

function groupCounts(workouts) {
  return workouts.reduce((groups, workout) => {
    workout.exercises.forEach((item) => {
      const group = findExercise(item.exerciseId).group;
      groups[group] = (groups[group] || 0) + 1;
    });
    return groups;
  }, {});
}

function fatigueScore(workouts) {
  const recent = workouts.slice(-4);
  if (!recent.length) return 3;

  const avgRpe = average(recent.flatMap((workout) => workout.exercises.flatMap((exercise) => exercise.sets.map((set) => set.rpe).filter(Boolean)))) || 7;
  const sessions = getRecentWeekCount(workouts);
  const heavyBonus = recent.filter((workout) => (averageWorkoutRpe(workout) || 0) >= 8.5).length;
  return Math.min(10, Math.max(1, Math.round(avgRpe - 2 + sessions * 0.6 + heavyBonus)));
}

function getRecentWeekCount(workouts) {
  const now = workouts.length ? new Date(workouts.at(-1).date) : new Date();
  const cutoff = new Date(now);
  cutoff.setDate(now.getDate() - 14);
  return workouts.filter((workout) => new Date(workout.date) >= cutoff).length;
}

function readinessLabel(readiness) {
  return {
    good: "готов нормально",
    okay: "средне, без героизма",
    bad: "только лайт",
  }[readiness] || "готовность";
}

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(date));
}

function formatInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

// Запускаем приложение только после инициализации всех const/let ниже по файлу.
// Иначе ранний boot может попасть в temporal dead zone новых модулей.
boot();
