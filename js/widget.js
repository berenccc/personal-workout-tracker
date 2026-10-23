const REST_QUOTES = [
  "Отдых тоже тренировка. Мышцы растут, пока ты лежишь.",
  "Сегодня можно ничего не доказывать. Завтра тело скажет спасибо.",
  "Пропуск дня не обнуляет путь. Обнуляет только бросить совсем.",
  "Лёгкий день — это не слабость. Это то, из чего собирается сильный.",
  "Не каждый день рекорд. Каждый день — выбор вернуться.",
  "Восстановление — часть плана, а не дырка в нём.",
  "Ты уже в игре. Один спокойный день её не заканчивает.",
  "Сила любит терпение больше, чем героизм.",
  "Сегодня береги суставы. Железо никуда не денется.",
  "Хорошая тренировка начинается с хорошего сна, а не с чувства вины.",
  "Можно идти медленно. Нельзя только стоять и ругать себя за это.",
  "Тело запоминает регулярность, а не один идеальный понедельник.",
  "Отдых без угрызений — тоже дисциплина.",
  "Завтрашний подход будет легче, если сегодня ты не добил себя.",
  "Прогресс прячется в неделях, не в одном тяжёлом дне.",
  "Ты не обязан быть машиной. Ты обязан быть на своей стороне.",
  "Сделал меньше, чем хотел — всё равно сделал. Это считается.",
  "Спокойный день держит форму не хуже, чем злой.",
  "Не сравнивай свой вторник с чужим лучшим днём.",
  "Вернёшься — и вес будет на месте. Никуда он не убежит.",
  "Усталость проходит. Привычка остаётся, если её не бросать из стыда.",
  "Сегодня победа — лечь спать вовремя.",
  "Маленький шаг завтра лучше, чем идеальный план, который не начался.",
  "Ты строишь тело на годы. Один выходной в эту стройку входит.",
];

function restQuote(iso) {
  let hash = 0;
  for (const char of iso) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return REST_QUOTES[hash % REST_QUOTES.length];
}

function widgetRestCopy(iso, todayIso) {
  const future = iso > todayIso;
  return {
    title: "Отдых",
    meta: future ? "На этот день тренировки нет." : "Тренировок нет — отдыхай.",
    quote: future ? "" : restQuote(iso),
  };
}

function widgetWorkoutRows(workout) {
  return (workout.exercises || []).map((item) => {
    const exercise = findExercise(item.exerciseId);
    const name = widgetExerciseName(item.exerciseId);
    if (exercise?.cardio) return { name, detail: planWeightBrief(exercise, item.sets || []), state: "plan" };
    const summary = setsSummary(item.sets || []);
    const unit = exercise && Number((item.sets || []).find((set) => Number(set.weight))?.weight) ? ` ${shortUnit(exercise)}` : "";
    return { name, detail: summary ? `${summary}${unit}` : "", state: "plan" };
  });
}

function widgetSessionFacts(workout) {
  const minutes = workout.durationMinutes || (workout.durationMs ? Math.round(workout.durationMs / 60000) : null);
  const sets = (workout.exercises || []).reduce(
    (sum, item) => sum + (item.sets || []).filter((set) => set.done !== false && set.mark !== "skip").length,
    0
  );
  return [minutes ? `${minutes} мин` : null, sets ? `${sets} подх.` : null].filter(Boolean).join(" · ");
}

// Короткая оценка прошедшего дня: факты остаются в первой строке, сюда — только вывод.
function widgetSessionVerdict(workout) {
  const notes = `${workout?.notes || ""} ${workout?.afterNotes || ""}`.toLowerCase();
  if (/боль|колен|плеч|локт|сустав|травм|тянет|ныл/.test(notes)) return "В заметках есть про тело. Глянь.";
  const skipped = (workout?.exercises || []).reduce((sum, item) => {
    if (findExercise(item.exerciseId)?.cardio) return sum;
    return sum + (item.sets || []).filter((set) => set.mark === "skip" || set.done === false).length;
  }, 0);
  if (skipped >= 2) return "Не всё закрыто — и так нормально.";
  const rpe = Number(averageWorkoutRpe(workout));
  if (rpe >= 8.2) return "Было тяжело, но дожал. Молодец.";
  if (rpe && rpe <= 6.5) return "Легко и чисто. Запас ещё есть.";
  return "Закрыл ровно, без надрыва. Молодец.";
}

// Начать имеет смысл только в день тренировки, когда список уже собран.
function widgetDayChrome(iso, today, workout, plannedCount, active) {
  if (active && iso === today) return { button: "pair", buttonAction: "" };
  if (workout) return { button: "result", buttonAction: `day:${iso}` };
  if (iso === today && plannedCount > 0) return { button: "pair", buttonAction: "" };
  if (iso > today && plannedCount > 0) return { button: "open", buttonAction: `plan:${iso}` };
  if (iso >= today) return { button: "open", buttonAction: "open" };
  return { button: "open", buttonAction: `day:${iso}` };
}

function widgetDayContent(iso, active, snapshot) {
  const today = formatInputDate(new Date());
  const workout = [...state.workouts].reverse().find((item) => item.date === iso);
  const plannedItems = itemsForDate(iso);
  const chrome = widgetDayChrome(iso, today, workout, plannedItems.length, Boolean(active && iso === today));
  if (active && iso === today) {
    return { when: "Идёт тренировка", title: currentPlanTitle(), meta: widgetProgressLine(), rows: widgetPlanRows(true), quote: "", foot: [], ...chrome };
  }
  if (workout) {
    const facts = widgetSessionFacts(workout);
    const verdict = widgetSessionVerdict(workout);
    return {
      when: widgetWhenLabel(iso),
      title: trainingTitle(workout.exercises || []),
      meta: [facts, verdict].filter(Boolean).join("\n"),
      rows: widgetWorkoutRows(workout),
      quote: "",
      foot: [],
      ...chrome,
    };
  }
  if (plannedItems.length && iso >= today) {
    return {
      when: widgetWhenLabel(iso),
      title: trainingTitle(plannedItems),
      meta: widgetPlanLine(plannedItems),
      rows: widgetPlanRows(false, plannedItems),
      quote: "",
      foot: [],
      ...chrome,
    };
  }
  if (iso >= today && isPlannedDate(iso)) {
    return {
      when: widgetWhenLabel(iso),
      title: "Тренировка",
      meta: "Список ещё не собран",
      rows: [],
      quote: "",
      foot: iso === today ? widgetFooterLines(snapshot) : [],
      ...chrome,
    };
  }
  const rest = widgetRestCopy(iso, today);
  return {
    when: widgetWhenLabel(iso),
    title: rest.title,
    meta: rest.meta,
    rows: [],
    quote: rest.quote,
    foot: iso === today ? widgetFooterLines(snapshot) : [],
    ...chrome,
  };
}

function widgetWeekDays(active, snapshot) {
  return Object.fromEntries(weekWidgetDays().map((day) => [day.iso, widgetDayContent(day.iso, active, snapshot)]));
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
    return { label, date: String(date.getDate()), iso, done: done.has(iso), today: iso === today, state };
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

  if (!active) writeDayPlan(editingPlanIso || elements.dateInput.value, selected);
  const nextItems = active ? selected : itemsForDate(nextIso);
  const nextTitle = active
    ? currentPlanTitle()
    : (nextItems.length ? trainingTitle(nextItems) : (nextIso && isPlannedDate(nextIso) ? "Тренировка" : "Отдых"));
  const nextMeta = active
    ? widgetProgressLine()
    : (nextItems.length
      ? widgetPlanLine(nextItems)
      : (nextIso && isPlannedDate(nextIso) ? "Список ещё не собран" : "Тренировок нет — отдыхай."));

  const payload = {
    accent: currentAccent(),
    widgetStyle: currentWidgetStyle(),
    nextTitle,
    nextWhen: active ? "Идёт тренировка" : widgetWhenLabel(nextIso),
    nextMeta,
    nextDate: nextIso || "",
    isActive: active,
    activeTimer: formatDuration(getWorkoutDurationMs()),
    // Отдых тоже отсчитывается на стороне Android, по этим двум точкам.
    restStartedAtMs: active && restUntil > Date.now() ? restStartedAt : 0,
    restUntilMs: active && restUntil > Date.now() ? restUntil : 0,
    // Виджет тикает сам через Chronometer, поэтому ему нужна точка старта, а не текст.
    startedAtMs: active ? workoutTimer.startedAt : 0,
    startLabel: active ? "Открыть" : "Начать",
    lastMeta: widgetLastLine(last),
    lastHr: active ? "" : widgetBandLine(last),
    lastDate: last?.date || "",
    streak: weeklyStreak(dates),
    weekWorkouts: [...dates].filter((iso) => iso >= mondayOf(new Date())).length,
    sleep: widgetReadinessLine(snapshot),
    today: formatInputDate(new Date()),
    week: weekWidgetDays(),
    days: widgetWeekDays(active, snapshot),
    listLines: active ? widgetActiveLines() : widgetIdleLines(snapshot, nextItems),
    planRows: widgetPlanRows(active, nextItems),
    footerLines: active ? [] : widgetFooterLines(snapshot),
    ...(active ? widgetNotice() : {}),
    ...(active ? { liveSets: liveSetRows(), liveFocusUid: focusExercise()?.uid || "" } : {}),
    updatedAt: new Date().toISOString(),
  };

  bridge.setWidgetData({ json: JSON.stringify(payload) }).catch(() => {});
}

// Замер с браслета. В виджет и таймер попадает только свежий: старый пик с подхода
// не должен висеть, когда на браслете пульс уже упал.
let liveBandHr = null;

function freshLiveHr() {
  if (!liveBandHr?.bpm || Date.now() - liveBandHr.at > 25000) return null;
  return liveBandHr.bpm;
}

function setsSummary(sets) {
  const work = sets.filter((set) => set.mark !== "skip");
  if (!work.length) return "";
  const top = work.reduce((best, set) => (Number(set.weight) > Number(best.weight) ? set : best), work[0]);
  const reps = work.every((set) => Number(set.reps) === Number(work[0].reps)) ? work[0].reps : top.reps;
  return `${work.length}×${reps}${Number(top.weight) ? ` · ${formatNumber(top.weight)}` : ""}`;
}

// На виджете узко: «Тяга верхнего блока / тяга сверху» → «Тяга верхнего блока».
function widgetExerciseName(exerciseId) {
  const name = findExercise(exerciseId)?.name || exerciseId;
  return name.split(" / ")[0].trim();
}

// Строки плана для виджета: название слева, объём или прогресс ровной колонкой справа.
function widgetPlanRows(active, items = selected) {
  const current = active ? focusExercise() : items.find((item) => item.sets.some((set) => !set.done));
  return items.map((item) => {
    const exercise = findExercise(item.exerciseId);
    const name = widgetExerciseName(item.exerciseId);
    if (active) {
      const done = item.sets.filter((set) => set.done).length;
      const state = done === item.sets.length ? "done" : item === current ? "current" : "todo";
      return { name, detail: `${done}/${item.sets.length}`, state };
    }
    if (exercise?.cardio) return { name, detail: planWeightBrief(exercise, item.sets), state: "plan" };
    const summary = setsSummary(item.sets);
    const unit = exercise && Number(item.sets.find((set) => Number(set.weight))?.weight) ? ` ${shortUnit(exercise)}` : "";
    return { name, detail: summary ? `${summary}${unit}` : "", state: "plan" };
  });
}

function widgetFooterLines(snapshot) {
  const lines = [];
  const today = [
    snapshot.todaySteps != null ? `${Number(snapshot.todaySteps).toLocaleString("ru-RU")} шагов` : null,
    snapshot.todayCalories ? `${snapshot.todayCalories} ккал` : null,
    snapshot.restingHr ? `пульс покоя ${snapshot.restingHr}` : null,
  ].filter(Boolean);
  if (today.length) lines.push(`Сегодня: ${today.join(" · ")}`);
  const weekStart = mondayOf(new Date());
  const week = state.workouts.filter((workout) => workout.date >= weekStart);
  if (week.length) {
    const sets = week.reduce((sum, workout) => sum + doneSetCount(workout), 0);
    lines.push(`Неделя: ${week.length} ${plural(week.length, "тренировка", "тренировки", "тренировок")} · ${sets} подх.`);
  }
  return lines;
}

// Высокий виджет показывает больше: сначала упражнения, потом день и неделя.
function widgetIdleLines(snapshot, items = selected) {
  const lines = items.map((item, index) => {
    const name = findExercise(item.exerciseId)?.name || item.exerciseId;
    const sets = setsSummary(item.sets);
    return `${index + 1}. ${name}${sets ? ` — ${sets}` : ""}`;
  });

  const today = [
    snapshot.todaySteps != null ? `${Number(snapshot.todaySteps).toLocaleString("ru-RU")} шагов` : null,
    snapshot.todayCalories ? `${snapshot.todayCalories} ккал` : null,
    snapshot.restingHr ? `пульс покоя ${snapshot.restingHr}` : null,
  ].filter(Boolean);
  if (today.length) lines.push("", `Сегодня: ${today.join(" · ")}`);

  const weekStart = mondayOf(new Date());
  const week = state.workouts.filter((workout) => workout.date >= weekStart);
  if (week.length) {
    const sets = week.reduce((sum, workout) => sum + doneSetCount(workout), 0);
    lines.push(`Неделя: ${week.length} ${plural(week.length, "тренировка", "тренировки", "тренировок")} · ${sets} подх.`);
  }
  return lines;
}

function widgetActiveLines() {
  const current = focusExercise();
  return selected.map((item) => {
    const name = findExercise(item.exerciseId)?.name || item.exerciseId;
    const done = item.sets.filter((set) => set.done).length;
    const mark = done === item.sets.length ? "✓" : item === current ? "▸" : "·";
    return `${mark} ${name} ${done}/${item.sets.length}`;
  });
}

function lockSetDetail(exercise, set) {
  if (exercise?.cardio) {
    const minutes = Number(set.weight) || 0;
    return minutes ? `${formatNumber(minutes)} мин` : "кардио";
  }
  const reps = Number(set.reps) || 0;
  if (exercise?.bodyweight || exercise?.unit === "повторы" || exercise?.unit === "сек/повт" || !Number(set.weight)) {
    const unit = exercise?.unit === "сек/повт" ? "сек" : "раз";
    return reps ? `${reps} ${unit}` : "";
  }
  return `${formatNumber(set.weight)} ${shortUnit(exercise)} × ${reps || "—"}`;
}

function liveSetRows() {
  const rows = [];
  const focused = focusExercise();
  const ordered = focused ? [focused, ...selected.filter((item) => item.uid !== focused.uid)] : selected;
  ordered.forEach((item) => {
    const exercise = findExercise(item.exerciseId);
    item.sets.forEach((set, index) => {
      if (set.mark === "skip") return;
      rows.push({
        id: `${item.uid}:${index}`,
        name: (exercise?.name || item.exerciseId).split(" / ")[0],
        step: `Подход ${index + 1} из ${item.sets.length}`,
        detail: lockSetDetail(exercise, set),
        done: Boolean(set.done),
      });
    });
  });
  return rows;
}

async function applyLockDones() {
  const bridge = window.Capacitor?.Plugins?.WidgetBridge;
  if (!bridge?.consumeLockDones || !workoutIsLive()) return;
  let ids = [];
  let lockFocus = "";
  try {
    const focus = await bridge.consumeLockFocus?.();
    lockFocus = String(focus?.uid || "");
    const result = await bridge.consumeLockDones();
    ids = Array.isArray(result?.ids) ? result.ids : [];
  } catch {
    return;
  }
  let changed = false;
  if (lockFocus && selected.some((entry) => entry.uid === lockFocus) && lockFocus !== focusUid) {
    focusUid = lockFocus;
    changed = true;
  }
  if (!ids.length) {
    if (changed) {
      renderSelectedExercises();
      saveWorkoutDraft();
      updateNativeWidget();
    }
    return;
  }
  let marked = false;
  ids.forEach((id) => {
    const [uid, indexRaw] = String(id).split(":");
    const item = selected.find((entry) => entry.uid === uid);
    const index = Number(indexRaw);
    const set = item?.sets?.[index];
    if (!item || !set || set.done) return;
    set.done = true;
    set.doneAt = Date.now();
    set.rpe = feelRpe(set.mark);
    marked = true;
    if (isExerciseComplete(item)) {
      const upcoming = selected.find((entry) => entry.uid !== item.uid && !isExerciseComplete(entry));
      if (upcoming) focusUid = upcoming.uid;
    }
  });
  if (!changed && !marked) return;
  if (marked) startRest();
  renderSelectedExercises();
  saveWorkoutDraft();
  updateNativeWidget();
}

function widgetNotice() {
  const sets = selected.flatMap((item) => item.sets);
  const doneSets = sets.filter((set) => set.done).length;
  const current = focusExercise();
  const bpm = freshLiveHr();
  const progress = `${doneSets}/${sets.length} подходов`;
  const currentName = current ? findExercise(current.exerciseId)?.name : null;
  return {
    activeEyebrow: bpm ? `Идёт тренировка · ♥ ${bpm}` : "Идёт тренировка",
    noticeTitle: bpm ? `♥ ${bpm} · ${progress}` : `Тренировка · ${progress}`,
    noticeProgress: progress,
    noticeText: currentName ? `Сейчас: ${currentName}` : "Все подходы закрыты",
    noticeDetails: widgetActiveLines().join("\n"),
  };
}

// Что именно предстоит: упражнения, объём и прикидка времени.
function widgetPlanLine(items = selected) {
  if (!items.length) return "План ещё не собран — собери в приложении";
  const sets = items.reduce((sum, item) => sum + item.sets.length, 0);
  const minutes = Math.round((sets * 2.6 + items.length * 1.5) / 5) * 5;
  const names = items
    .slice(0, 3)
    .map((item) => findExercise(item.exerciseId)?.name)
    .filter(Boolean)
    .join(", ");
  return `${items.length} упр. · ${sets} подх. · ~${minutes} мин${names ? `\n${names}` : ""}`;
}

// Во время тренировки виджет показывает реальный прогресс, а не просто план.
function widgetProgressLine() {
  const sets = selected.flatMap((item) => item.sets);
  const doneSets = sets.filter((set) => set.done).length;
  const doneExercises = selected.filter((item) => item.sets.every((set) => set.done)).length;
  const current = focusExercise();
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

function acknowledgeWidgetOpen(selector) {
  requestAnimationFrame(() => {
    const target = document.querySelector(selector);
    if (!target) return;
    target.classList.remove("widget-ack");
    void target.offsetWidth;
    target.classList.add("widget-ack");
    target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    window.setTimeout(() => target.classList.remove("widget-ack"), 720);
  });
}

function handleWidgetAction(action) {
  if (!action) return;
  if (action === "start" || action === "open") {
    window.showAppView?.("workout");
    // Тап по виджету легко сделать случайно, поэтому тренировку не стартуем без подтверждения.
    if (action === "start" && !workoutTimer.startedAt) showStartPrompt();
    acknowledgeWidgetOpen("#startWorkoutButton");
    return;
  }
  if (action === "last" || action.startsWith("day:")) {
    const iso = action.startsWith("day:") ? action.slice(4) : state.workouts.at(-1)?.date;
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      selectedDayIso = iso;
      calendarCursor = new Date(`${iso}T00:00:00`);
    }
    window.showAppView?.("calendar");
    renderScheduleCalendar();
    renderDayDetail();
    acknowledgeWidgetOpen("#dayDetail .day-detail-card");
    return;
  }
  if (action.startsWith("plan:")) {
    const iso = action.slice(5);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      openDayPlan(iso);
      acknowledgeWidgetOpen("#workoutForm");
    }
  }
}

function showStartPrompt() {
  document.querySelector("#startPrompt")?.remove();
  const sets = selected.reduce((sum, item) => sum + item.sets.length, 0);
  const plan = selected.length
    ? `${escapeHtml(currentPlanTitle())} · ${selected.length} упр. · ${sets} подх.`
    : "План пуст — можно начать и добавить упражнения по ходу.";
  const sheet = document.createElement("div");
  sheet.id = "startPrompt";
  sheet.className = "start-prompt";
  sheet.innerHTML = `
    <div class="start-prompt-card" role="dialog" aria-label="Начать тренировку">
      <strong>Начинаем тренировку?</strong>
      <p>${plan}</p>
      <div class="start-prompt-actions">
        <button class="button ghost" type="button" data-start-prompt="cancel">Не сейчас</button>
        <button class="button primary" type="button" data-start-prompt="go">Стартуем</button>
      </div>
    </div>
  `;
  sheet.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-start-prompt]")?.dataset.startPrompt;
    if (!choice && event.target !== sheet) return;
    sheet.remove();
    if (choice === "go" && !workoutTimer.startedAt) startWorkoutTimer();
  });
  document.body.appendChild(sheet);
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
