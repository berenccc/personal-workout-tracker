function renderCharts() {
  const exercise = exercises.find((item) => item.id === chartExerciseId);
  const weightTitle = document.querySelector("#weightChartTitle");
  const volumeTitle = document.querySelector("#volumeChartTitle");
  if (!exercise) {
    if (weightTitle) weightTitle.textContent = "Прогресс";
    if (volumeTitle) volumeTitle.textContent = "Сумма";
    elements.weightChart.innerHTML = emptyChart("Выбери упражнение, которое уже было в тренировках.");
    elements.volumeChart.innerHTML = emptyChart("Пока нет данных.");
    return;
  }
  const kind = exerciseResultKind(exercise);
  const bestLabel = kind === "time" ? "Минуты за тренировку" : kind === "reps" ? "Лучший подход, повторы" : "Лучший вес по тренировкам";
  const sumLabel = kind === "time" ? "Сумма минут" : kind === "reps" ? "Сумма повторов" : "Объём, кг × повторы";
  const axis = kind === "time" ? "мин" : kind === "reps" ? (exercise.unit === "сек/повт" ? "сек" : "раз") : "кг";
  if (weightTitle) weightTitle.textContent = bestLabel;
  if (volumeTitle) volumeTitle.textContent = sumLabel;

  const points = state.workouts
    .map((workout) => {
      const item = (workout.exercises || []).find((entry) => entry.exerciseId === exercise.id);
      if (!item) return null;
      const measured = chartPoint(exercise, item);
      return { label: workout.date.slice(5), ...measured };
    })
    .filter(Boolean);

  elements.weightChart.innerHTML = points.length
    ? lineSvg(points.map((point) => point.best), points.map((point) => point.label), bestLabel)
    : emptyChart("Пока нет данных по этому упражнению.");
  elements.volumeChart.innerHTML = points.length
    ? barSvg(points.map((point) => point.volume), points.map((point) => point.label), 240, `${sumLabel}, ${axis}`)
    : emptyChart("Пока нет данных по объёму.");
}

function chartPoint(exercise, item) {
  const sets = item.sets || [];
  const kind = exerciseResultKind(exercise);
  if (kind === "time") {
    const minutes = sets.map((set) => Number(set.weight) || 0);
    return {
      best: Math.max(0, ...minutes),
      volume: minutes.reduce((sum, value) => sum + value, 0),
    };
  }
  if (kind === "reps") {
    const reps = sets.map((set) => Number(set.reps) || 0);
    return {
      best: Math.max(0, ...reps),
      volume: reps.reduce((sum, value) => sum + value, 0),
    };
  }
  const best = bestSet(item);
  return { best: best ? Number(best.weight) || 0 : 0, volume: exerciseVolume(item) };
}

function lineSvg(values, labels, title = "Вес") {
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
      <text x="${padding}" y="22" fill="var(--muted)" font-size="12">${title}</text>
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

const HISTORY_PAGE = 20;
let historyLimit = HISTORY_PAGE;

function workoutTitle(workout) {
  return trainingTitle(workout.exercises || []);
}

function historyMonthLabel(iso) {
  const date = new Date(`${iso.slice(0, 7)}-01T12:00:00`);
  const label = date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(" г.", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function renderHistory() {
  if (!elements.historyList) return;
  const all = state.workouts
    .map((workout, index) => ({ workout, index }))
    .sort((a, b) => b.workout.date.localeCompare(a.workout.date) || b.index - a.index);
  const meta = document.querySelector("#historyMeta");
  if (meta) meta.textContent = all.length ? `${all.length} ${plural(all.length, "тренировка", "тренировки", "тренировок")}` : "";

  if (!all.length) {
    elements.historyList.innerHTML = `<div class="empty">Пока пусто. Сохранённые тренировки появятся здесь.</div>`;
    return;
  }

  let month = "";
  const rows = all.slice(0, historyLimit).map(({ workout, index }) => {
    const monthKey = workout.date.slice(0, 7);
    const header = monthKey !== month ? `<h3 class="history-month">${historyMonthLabel(workout.date)}</h3>` : "";
    month = monthKey;
    const facts = [
      `${doneSetCount(workout)}/${workoutSetCount(workout)} подх.`,
      workout.durationMinutes ? `${workout.durationMinutes} мин` : null,
      averageWorkoutRpe(workout) ? `RPE ${averageWorkoutRpe(workout)}` : null,
      workout.wearable?.calories ? `${workout.wearable.calories} ккал` : null,
    ].filter(Boolean).join(" · ");
    const exercisesHtml = (workout.exercises || []).map((item) => {
      const sets = (item.sets || [])
        .map((set) => `${formatNumber(set.weight)}×${set.reps}${set.rpe ? `<em>@${set.rpe}</em>` : ""}${set.done === false ? " ✗" : ""}`)
        .join(", ");
      return `<li><strong>${escapeHtml(findExercise(item.exerciseId)?.name || item.exerciseId)}</strong><span>${sets}</span></li>`;
    }).join("");
    return `
      ${header}
      <details class="history-item" data-history-index="${index}">
        <summary>
          <div class="history-row-main">
            <strong>${escapeHtml(workoutTitle(workout))}</strong>
            <small>${escapeHtml(facts)}</small>
          </div>
          <span class="history-date">${formatDate(workout.date)}</span>
        </summary>
        <div class="history-body">
          <div class="day-detail-meta">
            <span>${readinessLabel(workout.readiness)}</span>
            ${workout.sessionEffort ? `<span>${sessionEffortLabel(workout.sessionEffort)}</span>` : ""}
            ${workout.wearable?.hrAvg ? `<span>пульс ${workout.wearable.hrAvg}</span>` : ""}
          </div>
          ${workout.notes ? `<p class="day-detail-note">${escapeHtml(workout.notes)}</p>` : ""}
          ${workout.afterNotes ? `<p class="day-detail-note after">«${escapeHtml(workout.afterNotes)}»</p>` : ""}
          <ul class="day-detail-exercises">${exercisesHtml}</ul>
          <button class="button ghost danger-action" type="button" data-action="delete-workout" data-index="${index}">Удалить тренировку</button>
        </div>
      </details>
    `;
  }).join("");

  const more = all.length > historyLimit
    ? `<button class="button ghost history-more" type="button" data-action="history-more">Показать ещё (${all.length - historyLimit})</button>`
    : "";
  elements.historyList.innerHTML = rows + more;
}
