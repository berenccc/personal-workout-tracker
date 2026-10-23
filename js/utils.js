function makeUid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 10);
  const iso = formatInputDate(cutoff);
  const today = formatInputDate(new Date());
  const recent = workouts.filter((workout) => workout.date >= iso && workout.date < today).slice(-3);
  if (!recent.length) return 3;

  const avgRpe = average(recent.flatMap((workout) =>
    (workout.exercises || []).flatMap((exercise) => (exercise.sets || []).map((set) => set.rpe).filter(Boolean))
  )) || 7;
  let score = avgRpe - 1.5;
  recent.forEach((workout) => {
    const signals = noteSignals(workout);
    if (workout.sessionEffort === "too-hard") score += 1.5;
    else if (workout.sessionEffort === "hard") score += 0.7;
    if (signals.pain) score += 1.5;
    if ((averageWorkoutRpe(workout) || 0) >= 8.5) score += 0.8;
  });
  return Math.min(10, Math.max(1, Math.round(score)));
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
