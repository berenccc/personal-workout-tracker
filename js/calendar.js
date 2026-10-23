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
  selectedDayIso = selectedDayIso === iso ? null : iso;
  renderDayDetail();
  renderScheduleCalendar();
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
      renderFutureDayPlan(box, selectedDayIso, today);
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
  renderCoach();
  updateNativeWidget();
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
