function exercisePickList() {
  const available = exercises.filter((exercise) => isExerciseAvailable(exercise));
  return available.length ? available : exercises;
}

function renderExercisePicker() {
  const list = elements.exercisePickList;
  if (!list) return;
  const query = (elements.exerciseSearchInput?.value || "").trim().toLocaleLowerCase("ru");
  const pickList = exercisePickList()
    .filter((exercise) => {
      if (!query) return true;
      const haystack = `${exercise.name} ${exercise.nameEn || ""}`.toLocaleLowerCase("ru");
      return haystack.includes(query);
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  list.innerHTML = pickList.length
    ? pickList.map((exercise) =>
      `<button type="button" class="exercise-pick-option" data-exercise-id="${exercise.id}">${escapeHtml(exercise.name)}</button>`
    ).join("")
    : `<p class="empty">Ничего не нашлось</p>`;
}

function openPlanEditor() {
  const editor = document.querySelector("#planEditor");
  const host = document.querySelector("#planEditorHost");
  if (!editor || !host || !elements.selectedExercises) return;
  host.appendChild(elements.selectedExercises);
  editor.hidden = false;
}

function closePlanEditor() {
  const editor = document.querySelector("#planEditor");
  const form = document.querySelector("#workoutForm");
  const anchor = form?.querySelector(".save-hint");
  if (editor && form && elements.selectedExercises && anchor) form.insertBefore(elements.selectedExercises, anchor);
  if (editor) editor.hidden = true;
  closeExercisePicker();
  renderCoach();
}

function openExercisePicker() {
  const sheet = document.querySelector("#exercisePickerSheet");
  if (!sheet) return;
  if (elements.exerciseSearchInput) elements.exerciseSearchInput.value = "";
  renderExercisePicker();
  sheet.hidden = false;
  elements.exerciseSearchInput?.focus();
}

function closeExercisePicker() {
  const sheet = document.querySelector("#exercisePickerSheet");
  if (sheet) sheet.hidden = true;
}

let chartExerciseId = "";

function doneExerciseIds() {
  const ids = new Set();
  state.workouts.forEach((workout) =>
    (workout.exercises || []).forEach((item) => {
      if (item.exerciseId) ids.add(item.exerciseId);
    })
  );
  return ids;
}

function setChartMenu(open) {
  const menu = document.querySelector("#chartExerciseMenu");
  const button = document.querySelector("#chartExerciseButton");
  if (menu) menu.hidden = !open;
  if (button) button.setAttribute("aria-expanded", open ? "true" : "false");
}

function fillExerciseSelects() {
  renderExercisePicker();

  const chartPick = exercises
    .filter((exercise) => doneExerciseIds().has(exercise.id))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  if (!chartPick.some((exercise) => exercise.id === chartExerciseId)) {
    chartExerciseId = chartPick[0]?.id || "";
  }
  const list = document.querySelector("#chartExerciseList");
  if (list) {
    list.innerHTML = chartPick.length
      ? chartPick.map((exercise) =>
        `<button type="button" class="chart-exercise-option${exercise.id === chartExerciseId ? " is-on" : ""}" data-chart-exercise="${exercise.id}">${escapeHtml(exercise.name)}</button>`
      ).join("")
      : `<p class="empty">Пока нет упражнений с историей.</p>`;
  }
  const label = document.querySelector("#chartExerciseLabel");
  if (label) label.textContent = chartPick.find((exercise) => exercise.id === chartExerciseId)?.name || "Нет истории";
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

const DAY_PLANS_KEY = "training-tracker-day-plans-v1";

function workoutIsLive() {
  return Boolean(workoutTimer.startedAt && !workoutTimer.stoppedAt);
}

function loadDayPlans() {
  try {
    const saved = JSON.parse(localStorage.getItem(DAY_PLANS_KEY));
    dayPlans = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    dayPlans = {};
  }
}

function saveDayPlans() {
  localStorage.setItem(DAY_PLANS_KEY, JSON.stringify(dayPlans));
}

function planTemplate(items) {
  return (items || [])
    .map((item) => ({
      exerciseId: item.exerciseId,
      sets: (item.sets || []).map((set) => ({
        weight: set.weight,
        reps: set.reps,
        rpe: set.rpe ?? "",
      })),
    }))
    .filter((item) => item.exerciseId && item.sets.length);
}

function writeDayPlan(iso, items = selected) {
  if (!iso || workoutIsLive()) return;
  const exercises = planTemplate(items);
  if (!exercises.length) delete dayPlans[iso];
  else dayPlans[iso] = { exercises, notes: elements.notesInput?.value || "" };
  saveDayPlans();
}

function loadDayPlanIntoSelected(iso) {
  const stored = dayPlans[iso];
  const valid = (stored?.exercises || []).filter((item) => findExercise(item.exerciseId));
  selected = valid.map((item) =>
    planEntry(item.exerciseId, (item.sets || []).map((set) => [set.weight, set.reps, set.rpe ?? ""]))
  );
  if (typeof stored?.notes === "string") elements.notesInput.value = stored.notes;
}

function itemsForDate(iso) {
  if (!iso) return [];
  const today = formatInputDate(new Date());
  if (workoutIsLive() && iso === today) return selected;
  if (!workoutIsLive() && iso === (editingPlanIso || elements.dateInput?.value)) return selected;
  return dayPlans[iso]?.exercises || [];
}

function openDayPlan(iso) {
  if (workoutIsLive()) {
    showToast("Сначала заверши текущую тренировку", "warn");
    return;
  }
  if (editingPlanIso && editingPlanIso !== iso) writeDayPlan(editingPlanIso, selected);
  if (!isPlannedDate(iso)) {
    excludeSet().delete(iso);
    if (!weekdays().has(weekdayIndex(iso))) schedule().add(iso);
    saveSchedule();
  }
  elements.dateInput.value = iso;
  editingPlanIso = iso;
  loadDayPlanIntoSelected(iso);
  renderSelectedExercises();
  renderScheduleCalendar();
  renderCoach();
  updateNativeWidget();
  window.showAppView?.("workout");
}

function renderFutureDayPlan(box, iso, today) {
  const planned = isPlannedDate(iso);
  const items = itemsForDate(iso);
  const lines = items.map((item, index) => {
    const exercise = findExercise(item.exerciseId);
    const name = exercise ? exercise.name : item.exerciseId;
    return `<li><b>${index + 1}.</b> ${escapeHtml(name)}</li>`;
  }).join("");
  const when = iso === today ? "Сегодня" : formatDate(iso);
  box.hidden = false;
  box.innerHTML = `
    <article class="day-detail-card">
      <div class="day-detail-head">
        <strong>${when}</strong>
        <button class="icon-button day-detail-close" type="button" aria-label="Закрыть">×</button>
      </div>
      <p class="day-detail-note">${planned ? "День отмечен в календаре. Список упражнений только у этой даты." : "День пока не в календаре."}</p>
      ${lines ? `<ol class="day-detail-exercises">${lines}</ol>` : `<p class="day-detail-note">Списка упражнений ещё нет.</p>`}
      <div class="day-detail-actions">
        <button class="button secondary" type="button" data-action="open-plan">Открыть план</button>
        <button class="button ghost" type="button" data-action="toggle-plan">${planned ? "Снять отметку" : "Запланировать"}</button>
      </div>
    </article>
  `;
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

// Название по тому, чему отдана тренировка: считаем подходы по зонам,
// мелкие добивки (кор, пара подходов на руки) в название не тащим.
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

function trainingTitle(items) {
  const volume = new Map();
  let cardioSets = 0;
  items.forEach((item) => {
    const group = findExercise(item.exerciseId)?.group;
    const sets = Math.max(1, (item.sets || []).filter((set) => set.mark !== "skip").length);
    if (group === "Кардио") cardioSets += sets;
    const area = TITLE_AREAS[group];
    if (area) volume.set(area, (volume.get(area) || 0) + sets);
  });
  if (!volume.size) return cardioSets ? "Кардио" : "Тренировка";

  // Кор почти всегда добивка — в название попадает, только если кроме него ничего нет.
  if (volume.size > 1) volume.delete("кор");
  const total = [...volume.values()].reduce((sum, sets) => sum + sets, 0);
  const ranked = [...volume.entries()].sort((a, b) => b[1] - a[1]);
  const main = ranked.filter(([, sets], index) => index === 0 || sets / total >= 0.2).map(([area]) => area);
  const upper = main.filter((area) => UPPER_AREAS.has(area));

  let words;
  if (main.includes("ноги") && upper.length >= 2) words = ["всё тело"];
  else if (upper.length >= 3) words = ["верх тела"];
  else words = main.slice(0, 2).sort((a, b) => TITLE_ORDER.indexOf(a) - TITLE_ORDER.indexOf(b));

  const text = words.length > 1 ? `${words[0]} и ${words[1]}` : words[0];
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function currentPlanTitle() {
  return trainingTitle(selected);
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
