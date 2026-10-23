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
  const rows = [...doneExerciseIds()]
    .map((exerciseId) => {
      const resolved = (typeof EXERCISE_ALIASES !== "undefined" && EXERCISE_ALIASES[exerciseId]) || exerciseId;
      return exercises.find((exercise) => exercise.id === resolved);
    })
    .filter(Boolean)
    .filter((exercise, index, list) => list.findIndex((item) => item.id === exercise.id) === index)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .map((exercise) => {
      const pair = exerciseResultPair(exercise);
      const last = lastExerciseDate(exercise.id);
      return `
        <article class="pr-item">
          <div>
            <strong>${escapeHtml(exercise.name)}</strong>
            <span>${last ? `последний раз ${formatDate(last)}` : ""}</span>
          </div>
          <div class="pr-pair">
            <div><small>${pair.workLabel}</small><b>${pair.work}</b></div>
            <div><small>${pair.maxLabel}</small><b>${pair.max}</b></div>
          </div>
        </article>
      `;
    })
    .join("");

  elements.prBoard.innerHTML = rows || `<div class="empty">Результаты появятся после первой тренировки.</div>`;
}

function lastExerciseDate(exerciseId) {
  const found = [...state.workouts].reverse().find((workout) =>
    (workout.exercises || []).some((item) => item.exerciseId === exerciseId)
  );
  return found?.date || "";
}

function exerciseResultKind(exercise) {
  if (exercise?.cardio) return "time";
  if (exercise?.bodyweight || exercise?.unit === "повторы" || exercise?.unit === "сек/повт") return "reps";
  return "weight";
}

function exerciseResultPair(exercise) {
  const kind = exerciseResultKind(exercise);
  const working = pickWorkingLoad(exercise);
  const best = bestExercisePerformance(state.workouts, exercise.id);
  if (kind === "time") {
    return {
      workLabel: "сейчас",
      work: working ? `${formatNumber(working.weight)} мин` : "—",
      maxLabel: "дольше всего",
      max: best ? `${formatNumber(best.set.weight)} мин` : "—",
    };
  }
  if (kind === "reps") {
    const unit = exercise.unit === "сек/повт" ? "сек" : "раз";
    const bestReps = bestRepsFor(exercise.id);
    return {
      workLabel: "сейчас",
      work: working ? `${working.reps} ${unit}` : "—",
      maxLabel: "максимум",
      max: bestReps ? `${bestReps} ${unit}` : "—",
    };
  }
  const unit = shortUnit(exercise);
  return {
    workLabel: "рабочий",
    work: working ? `${formatNumber(working.weight)} ${unit}` : "—",
    maxLabel: exercise.lowerIsBetter ? "лучший" : "максимум",
    max: best ? `${formatNumber(best.set.weight)} ${unit}` : "—",
  };
}

function bestRepsFor(exerciseId) {
  let best = 0;
  state.workouts.forEach((workout) => {
    (workout.exercises || []).filter((item) => item.exerciseId === exerciseId).forEach((item) => {
      (item.sets || []).forEach((set) => {
        best = Math.max(best, Number(set.reps) || 0);
      });
    });
  });
  return best;
}
