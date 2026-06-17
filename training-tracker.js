const STORAGE_KEY = "training-tracker-v3";

const exercises = [
  { id: "leg-press", name: "Жим ногами", group: "Ноги", unit: "кг", step: 10, defaultSets: [[140, 10], [160, 10], [180, 10]] },
  { id: "leg-curl", name: "Сгибание ног", group: "Ноги", unit: "кг", step: 2.5, defaultSets: [[35, 12], [42.5, 10], [50, 10]] },
  { id: "leg-extension", name: "Разгибание ног", group: "Ноги", unit: "кг", step: 2.5, defaultSets: [[55, 10], [60, 10], [60, 10]] },
  { id: "split-squat", name: "Сплит-присед / выпад", group: "Ноги", unit: "кг", step: 2, defaultSets: [[16, 10], [16, 10], [16, 10]] },
  { id: "step-lunge", name: "Step-up + reverse lunge", group: "Ноги", unit: "кг", step: 2, defaultSets: [[16, 20], [16, 20], [16, 20]] },
  { id: "goblet-squat", name: "Присед с диском/гирей", group: "Ноги", unit: "кг", step: 2, defaultSets: [[20, 12], [20, 12], [20, 12]] },
  { id: "calf-flex", name: "Сгибание ступней / икры", group: "Икры", unit: "кг", step: 5, defaultSets: [[80, 12], [90, 12], [95, 12]] },
  { id: "gravitron", name: "Гравитрон / подтягивания", group: "Спина", unit: "кг противовес", step: -2.5, lowerIsBetter: true, defaultSets: [[40, 8], [35, 8], [30, 8]] },
  { id: "lat-pulldown", name: "Тяга верхнего блока", group: "Спина", unit: "кг", step: 2.5, defaultSets: [[52, 10], [56, 10], [60, 8]] },
  { id: "row", name: "Тяга горизонтального блока", group: "Спина", unit: "кг", step: 2.5, defaultSets: [[57, 10], [67, 8], [67, 10]] },
  { id: "one-arm-row", name: "Тяга гантели одной рукой", group: "Спина", unit: "кг/рука", step: 2, defaultSets: [[22, 10], [26, 10], [28, 10]] },
  { id: "barbell-row", name: "Тяга штанги в наклоне", group: "Спина", unit: "кг", step: 5, defaultSets: [[40, 8], [50, 8], [50, 8]] },
  { id: "bench", name: "Жим штанги лежа", group: "Грудь", unit: "кг", step: 2.5, defaultSets: [[50, 8], [55, 8], [60, 8]] },
  { id: "chest-machine", name: "Жим от груди / тренажер", group: "Грудь", unit: "кг", step: 2.5, defaultSets: [[40, 10], [50, 8], [55, 8]] },
  { id: "incline-press", name: "Жим под углом", group: "Грудь", unit: "кг", step: 2.5, defaultSets: [[40, 10], [50, 8], [55, 8]] },
  { id: "db-press", name: "Жим гантелей", group: "Грудь", unit: "кг/рука", step: 2.5, defaultSets: [[20, 10], [20, 10], [22.5, 8]] },
  { id: "incline-db-press", name: "Жим гантелей под углом", group: "Грудь", unit: "кг/рука", step: 2.5, defaultSets: [[18, 10], [20, 8], [20, 8]] },
  { id: "butterfly", name: "Баттерфляй / сведение", group: "Грудь", unit: "кг", step: 2.5, defaultSets: [[40, 10], [45, 10], [50, 8]] },
  { id: "dips", name: "Брусья в гравитроне", group: "Грудь", unit: "кг противовес", step: -2.5, lowerIsBetter: true, defaultSets: [[35, 8], [35, 8], [35, 8]] },
  { id: "shoulder-press", name: "Жим вверх", group: "Плечи", unit: "кг", step: 2.5, defaultSets: [[15, 10], [17.5, 10], [20, 10]] },
  { id: "deltoid-machine", name: "Дельта-машина", group: "Плечи", unit: "кг", step: 2.5, defaultSets: [[25, 10], [30, 8], [30, 8]] },
  { id: "reverse-fly", name: "Обратная бабочка", group: "Плечи", unit: "кг", step: 2.5, defaultSets: [[20, 10], [30, 10], [30, 10]] },
  { id: "deadlift", name: "Становая тяга", group: "Задняя цепь", unit: "кг", step: 5, defaultSets: [[60, 8], [70, 8], [80, 6]] },
  { id: "rdl", name: "Румынская тяга с гантелями", group: "Задняя цепь", unit: "кг/рука", step: 2.5, defaultSets: [[20, 10], [22.5, 10], [22.5, 10]] },
  { id: "single-leg-rdl", name: "Румынская тяга на одной ноге", group: "Задняя цепь", unit: "кг", step: 2, defaultSets: [[16, 10], [16, 10], [16, 10]] },
  { id: "back-extension", name: "Гиперэкстензия / разгибание спины", group: "Задняя цепь", unit: "кг", step: 5, defaultSets: [[15, 10], [15, 10], [15, 10]] },
  { id: "kettlebell-swing", name: "Махи гирей", group: "Задняя цепь", unit: "кг", step: 2, defaultSets: [[24, 10], [24, 10], [24, 10]] },
  { id: "biceps", name: "Бицепс", group: "Руки", unit: "кг", step: 2.5, defaultSets: [[25, 10], [30, 8], [30, 8]] },
  { id: "triceps", name: "Трицепс гантель/лежа", group: "Руки", unit: "кг", step: 1, defaultSets: [[10, 10], [10, 10], [12, 8]] },
  { id: "triceps-pushdown", name: "Трицепс верхний блок", group: "Руки", unit: "кг", step: 2.5, defaultSets: [[55, 10], [65, 10], [75, 8]] },
  { id: "dead-bug", name: "Dead Bug", group: "Кор", unit: "кг в руках", step: 1, defaultSets: [[16, 20], [16, 20], [16, 20]] },
  { id: "ab-wheel", name: "Ролик", group: "Кор", unit: "повторы", step: 1, bodyweight: true, defaultSets: [[0, 12], [0, 12], [0, 12]] },
  { id: "plank", name: "Планка / вариации", group: "Кор", unit: "сек/повт", step: 5, bodyweight: true, defaultSets: [[0, 40], [0, 40], [0, 40]] },
  { id: "side-plank", name: "Боковая планка", group: "Кор", unit: "сек/повт", step: 5, bodyweight: true, defaultSets: [[0, 15], [0, 15], [0, 15]] },
  { id: "bird-dog", name: "Bird-dog", group: "Кор", unit: "кг", step: 1, defaultSets: [[4, 10], [4, 10], [4, 10]] },
  { id: "overhead-plate", name: "Диск вокруг головы", group: "Кор", unit: "кг", step: 2.5, defaultSets: [[15, 12], [20, 10], [20, 10]] },
  { id: "box-jump", name: "Прыжки на блок", group: "Плиометрика", unit: "см/кг", step: 5, bodyweight: true, defaultSets: [[75, 10], [75, 10], [75, 10]] },
  { id: "rowing", name: "Гребля", group: "Кардио", unit: "мин", step: 1, cardio: true, defaultSets: [[5, 1]] },
  { id: "elliptical", name: "Эллипсоид / вело", group: "Кардио", unit: "мин", step: 1, cardio: true, defaultSets: [[12, 1]] },
  { id: "treadmill", name: "Дорожка", group: "Кардио", unit: "мин", step: 1, cardio: true, defaultSets: [[10, 1]] },
];

let state = loadState();
let selected = [];

const elements = {
  statsGrid: document.querySelector("#statsGrid"),
  seedButton: document.querySelector("#seedButton"),
  resetButton: document.querySelector("#resetButton"),
  workoutForm: document.querySelector("#workoutForm"),
  dateInput: document.querySelector("#dateInput"),
  readinessInput: document.querySelector("#readinessInput"),
  notesInput: document.querySelector("#notesInput"),
  sessionEffortInput: document.querySelector("#sessionEffortInput"),
  afterNotesInput: document.querySelector("#afterNotesInput"),
  exerciseSelect: document.querySelector("#exerciseSelect"),
  addExerciseButton: document.querySelector("#addExerciseButton"),
  copyReportButton: document.querySelector("#copyReportButton"),
  copyDataButton: document.querySelector("#copyDataButton"),
  selectedExercises: document.querySelector("#selectedExercises"),
  exerciseTemplate: document.querySelector("#exerciseTemplate"),
  coachBox: document.querySelector("#coachBox"),
  readinessPill: document.querySelector("#readinessPill"),
  monthlyChart: document.querySelector("#monthlyChart"),
  prBoard: document.querySelector("#prBoard"),
  fatigueChart: document.querySelector("#fatigueChart"),
  calendarHeatmap: document.querySelector("#calendarHeatmap"),
  chartExerciseSelect: document.querySelector("#chartExerciseSelect"),
  weightChart: document.querySelector("#weightChart"),
  volumeChart: document.querySelector("#volumeChart"),
  movementBalance: document.querySelector("#movementBalance"),
  historyList: document.querySelector("#historyList"),
};

boot();

function boot() {
  fillExerciseSelects();
  loadFridayPlan();
  bindEvents();
  render();
}

function entry(exerciseId, rows) {
  return {
    exerciseId,
    sets: rows.map(([weight, reps, rpe]) => ({ weight, reps, rpe })),
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { version: 3, workouts: window.trainingHistory || [] };

  try {
    const parsed = JSON.parse(raw);
    const saved = Array.isArray(parsed.workouts) ? parsed.workouts : [];
    return { version: 3, workouts: mergeWorkouts(window.trainingHistory || [], saved) };
  } catch {
    return { version: 3, workouts: window.trainingHistory || [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, workouts: state.workouts }));
}

function bindEvents() {
  elements.seedButton.addEventListener("click", () => {
    state.workouts = window.trainingHistory || [];
    loadFridayPlan();
    saveState();
    render();
  });

  elements.resetButton.addEventListener("click", () => {
    if (!confirm("Очистить все сохраненные тренировки?")) return;
    state = { workouts: [] };
    saveState();
    render();
  });

  elements.addExerciseButton.addEventListener("click", () => {
    addExercise(elements.exerciseSelect.value);
    renderSelectedExercises();
  });

  elements.copyReportButton.addEventListener("click", copyWorkoutReport);
  elements.copyDataButton.addEventListener("click", copyFullHistory);
  elements.readinessInput.addEventListener("change", renderCoach);
  elements.chartExerciseSelect.addEventListener("change", renderCharts);

  elements.workoutForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const workout = collectWorkout();
    if (!workout.exercises.length) {
      alert("Добавь хотя бы одно упражнение.");
      return;
    }

    state.workouts.push(workout);
    state.workouts.sort((a, b) => a.date.localeCompare(b.date));
    saveState();
    loadFridayPlan();
    render();
  });
}

function fillExerciseSelects() {
  const options = exercises
    .map((exercise) => `<option value="${exercise.id}">${exercise.name}</option>`)
    .join("");
  elements.exerciseSelect.innerHTML = options;
  elements.chartExerciseSelect.innerHTML = options;
  elements.chartExerciseSelect.value = "bench";
}

function mergeWorkouts(current, incoming) {
  const keyFor = (workout) => workout.id || `${workout.date}-${workout.notes || ""}`;
  const byDate = new Map(current.map((workout) => [keyFor(workout), workout]));
  incoming.forEach((workout) => byDate.set(keyFor(workout), workout));
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function addExercise(exerciseId) {
  const exercise = findExercise(exerciseId);
  selected.push({
    uid: makeUid(),
    exerciseId,
    sets: exercise.defaultSets.map(([weight, reps]) => ({ weight, reps, rpe: "", done: false, mark: "normal" })),
  });
}

function loadFridayPlan() {
  elements.dateInput.value = nextFridayAfterLatestWorkout();
  elements.readinessInput.value = "okay";
  elements.notesInput.value = "Пятница: верх + функциональный блок без отказа после среды ноги+спина. Если устал — минус один жим и греблю скипнуть.";
  elements.sessionEffortInput.value = "normal";
  elements.afterNotesInput.value = "";
  selected = [
    planEntry("elliptical", [[12, 1, 5]]),
    planEntry("bench", [[50, 8, 7], [60, 6, 8], [65, 5, 8]]),
    planEntry("incline-db-press", [[18, 8, 7], [20, 8, 8], [20, 8, 8]]),
    planEntry("shoulder-press", [[17.5, 10, 7], [20, 8, 8], [20, 8, 8]]),
    planEntry("lat-pulldown", [[56, 10, 7], [60, 8, 8], [60, 8, 8]]),
    planEntry("kettlebell-swing", [[24, 10, 7], [24, 10, 7], [24, 10, 7]]),
    planEntry("triceps-pushdown", [[65, 10, 7], [75, 10, 8], [75, 10, 8]]),
    planEntry("ab-wheel", [[0, 10, 7], [0, 10, 7], [0, 10, 7]]),
    planEntry("rowing", [[5, 1, 6]]),
  ];
}

function planEntry(exerciseId, rows) {
  return {
    uid: makeUid(),
    exerciseId,
    sets: rows.map(([weight, reps, rpe]) => ({ weight, reps, rpe, done: false, mark: "normal" })),
  };
}

function nextFridayAfterLatestWorkout() {
  const latestDate = state.workouts.at(-1)?.date;
  const base = latestDate ? new Date(latestDate) : new Date();
  const next = new Date(base);
  const daysUntilFriday = (5 - next.getDay() + 7) % 7 || 7;
  next.setDate(next.getDate() + daysUntilFriday);
  return next.toISOString().slice(0, 10);
}

function render() {
  renderStats();
  renderDashboard();
  renderSelectedExercises();
  renderCoach();
  renderCharts();
  renderMovementBalance();
  renderHistory();
}

function renderStats() {
  const workouts = state.workouts;
  const last = workouts.at(-1);
  const avgRpe = average(allSets(workouts).map((set) => Number(set.rpe)).filter(Boolean));
  const streak = getRecentWeekCount(workouts);
  const totalSets = workouts.reduce((sum, workout) => sum + workoutSetCount(workout), 0);

  elements.statsGrid.innerHTML = [
    stat(workouts.length, "тренировок сохранено"),
    stat(formatNumber(totalSets), "рабочих подходов"),
    stat(avgRpe ? avgRpe.toFixed(1) : "n/a", "средний RPE"),
    stat(last ? streak : 0, "тренировок за последние 14 дней"),
  ].join("");
}

function stat(value, label) {
  return `<article class="stat"><strong>${value}</strong><span>${label}</span></article>`;
}

function renderDashboard() {
  renderMonthlyChart();
  renderPrBoard();
  renderFatigueChart();
  renderHeatmap();
}

function renderMonthlyChart() {
  const monthly = monthlyStats(state.workouts);
  elements.monthlyChart.innerHTML = monthly.length
    ? barSvg(monthly.map((item) => item.count), monthly.map((item) => item.label), 300, "Тренировок в месяц")
    : emptyChart("Загрузи историю, чтобы увидеть регулярность по месяцам.");
}

function renderPrBoard() {
  const targets = ["bench", "leg-press", "gravitron", "row", "deadlift", "db-press", "butterfly", "shoulder-press"];
  const rows = targets
    .map((exerciseId) => bestExercisePerformance(state.workouts, exerciseId))
    .filter(Boolean)
    .map(({ exercise, set, workout }) => {
      const value = exercise.lowerIsBetter
        ? `${formatNumber(set.weight)} ${exercise.unit}`
        : `${formatNumber(set.weight)} ${exercise.unit}`;
      const subtitle = exercise.lowerIsBetter
        ? "меньше противовес = сильнее"
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

function renderFatigueChart() {
  const points = state.workouts.slice(-24).map((workout) => ({
    label: workout.date.slice(5),
    load: workoutSetCount(workout),
    rpe: Number(averageWorkoutRpe(workout)) || 0,
  }));

  elements.fatigueChart.innerHTML = points.length
    ? comboSvg(points, 300)
    : emptyChart("Пока нет данных для тренда нагрузки.");
}

function renderHeatmap() {
  const weeks = weeklyStats(state.workouts).slice(-26);
  elements.calendarHeatmap.innerHTML = weeks.length
    ? `<div class="heatmap-label">Последние 26 недель. Число в клетке - количество тренировок за неделю.</div>` + weeks.map((week) => {
      const level = week.count >= 3 ? 3 : week.count >= 2 ? 2 : week.count >= 1 ? 1 : 0;
      return `<div class="heatmap-cell level-${level}" title="${week.label}: ${week.count} тренировок">${week.count}</div>`;
    }).join("")
    : `<div class="empty">Календарь появится после загрузки истории.</div>`;
}

function renderSelectedExercises() {
  elements.selectedExercises.innerHTML = "";

  selected.forEach((item) => {
    const exercise = findExercise(item.exerciseId);
    const fragment = elements.exerciseTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".exercise-card");
    card.dataset.uid = item.uid;
    card.querySelector("h3").textContent = exercise.name;
    card.querySelector("p").textContent = `${exercise.group} · ${exercise.unit}`;
    card.querySelector(".icon-button").addEventListener("click", () => {
      selected = selected.filter((selectedItem) => selectedItem.uid !== item.uid);
      renderSelectedExercises();
    });

    const sets = card.querySelector(".sets");
    item.sets.forEach((set, index) => sets.appendChild(renderSetRow(item.uid, index, set, exercise)));
    card.querySelector(".add-set").addEventListener("click", () => {
      const last = item.sets.at(-1) || { weight: 0, reps: 10, rpe: "" };
      item.sets.push({ ...last, rpe: "", done: false, mark: "normal" });
      renderSelectedExercises();
    });

    elements.selectedExercises.appendChild(fragment);
  });
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
    <button class="icon-button delete-set" type="button" aria-label="Удалить подход">×</button>
  `;

  row.querySelectorAll("input[data-field], select[data-field]").forEach((input) => {
    input.addEventListener("input", () => {
      const item = selected.find((selectedItem) => selectedItem.uid === uid);
      item.sets[index][input.dataset.field] = input.type === "checkbox" ? input.checked : input.value;
    });
  });

  row.querySelectorAll("button[data-adjust]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = selected.find((selectedItem) => selectedItem.uid === uid);
      const field = button.dataset.adjust;
      const delta = Number(button.dataset.delta);
      const current = Number(item.sets[index][field]) || 0;
      item.sets[index][field] = Math.max(0, current + delta);
      renderSelectedExercises();
    });
  });

  row.querySelector(".delete-set").addEventListener("click", () => {
    const item = selected.find((selectedItem) => selectedItem.uid === uid);
    item.sets.splice(index, 1);
    renderSelectedExercises();
  });

  return row;
}

function collectWorkout() {
  return {
    id: `manual-${elements.dateInput.value}-${makeUid()}`,
    date: elements.dateInput.value,
    readiness: elements.readinessInput.value,
    notes: elements.notesInput.value.trim(),
    sessionEffort: elements.sessionEffortInput.value,
    afterNotes: elements.afterNotesInput.value.trim(),
    exercises: selected
      .map((item) => ({
        exerciseId: item.exerciseId,
        sets: item.sets
          .map((set) => ({
            weight: Number(set.weight),
            reps: Number(set.reps),
            rpe: Number(set.rpe) || null,
            done: Boolean(set.done),
            mark: set.mark || "normal",
          }))
          .filter((set) => set.reps > 0),
      }))
      .filter((item) => item.sets.length),
  };
}

async function copyWorkoutReport() {
  const workout = collectWorkout();
  const report = buildWorkoutReport(workout);

  try {
    await navigator.clipboard.writeText(report);
    elements.copyReportButton.textContent = "Отчет скопирован";
    setTimeout(() => {
      elements.copyReportButton.textContent = "Скопировать отчет";
    }, 1800);
  } catch {
    window.prompt("Скопируй отчет для чата:", report);
  }
}

async function copyFullHistory() {
  const report = [
    "Полная история из трекера:",
    JSON.stringify(state.workouts, null, 2),
    "",
    "Прочитай это состояние и помоги скорректировать следующие тренировки.",
  ].join("\n");

  try {
    await navigator.clipboard.writeText(report);
    elements.copyDataButton.textContent = "История скопирована";
    setTimeout(() => {
      elements.copyDataButton.textContent = "Скопировать историю";
    }, 1800);
  } catch {
    window.prompt("Скопируй историю для чата:", report);
  }
}

function buildWorkoutReport(workout) {
  const lines = [
    `Тренировка ${formatDate(workout.date)}`,
    `Самочувствие до: ${readinessLabel(workout.readiness)}`,
    `Итог: ${sessionEffortLabel(workout.sessionEffort)}`,
  ];

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

function renderCoach() {
  const readiness = elements.readinessInput.value;
  elements.readinessPill.textContent = readinessLabel(readiness);
  elements.readinessPill.className = `pill ${readiness === "good" ? "good" : readiness === "bad" ? "bad" : "warn"}`;

  const fatigue = fatigueScore(state.workouts);
  const next = nextSessionSuggestion(state.workouts, readiness, fatigue);
  elements.coachBox.innerHTML = next.map((item) => `
    <article class="coach-card">
      <strong>${item.title}</strong>
      <p>${item.text}</p>
    </article>
  `).join("");
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

function comboSvg(points, chartHeight = 300) {
  const width = 720;
  const height = chartHeight;
  const padding = 38;
  const maxLoad = Math.max(...points.map((point) => point.load), 1);
  const barWidth = (width - padding * 2) / Math.max(points.length, 1) - 6;
  const rpePoints = points.map((point, index) => {
    const x = padding + index * (barWidth + 6) + Math.max(barWidth, 4) / 2;
    const y = height - padding - (point.rpe / 10) * (height - padding * 2);
    return [x, y];
  });

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="RPE и объем по последним тренировкам">
      <path d="M ${padding} ${height - padding} H ${width - padding}" stroke="var(--line)" fill="none" />
      ${points.map((point, index) => {
        const barHeight = (point.load / maxLoad) * (height - padding * 2);
        const x = padding + index * (barWidth + 6);
        const y = height - padding - barHeight;
        return `<rect x="${x}" y="${y}" width="${Math.max(barWidth, 4)}" height="${barHeight}" rx="5" fill="rgba(122, 162, 255, 0.45)"><title>${point.label}: ${formatNumber(point.load)} подходов</title></rect>`;
      }).join("")}
      <path d="${rpePoints.map(([x, y], index) => `${index ? "L" : "M"} ${x} ${y}`).join(" ")}" stroke="var(--accent-2)" stroke-width="3" fill="none" />
      ${rpePoints.map(([x, y], index) => `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--accent-2)"><title>${points[index].label}: RPE ${points[index].rpe || "n/a"}</title></circle>`).join("")}
      <text x="${padding}" y="22" fill="var(--muted)" font-size="12">Столбцы: рабочие подходы · линия: средний RPE</text>
      <text x="${padding}" y="${height - 8}" fill="var(--muted)" font-size="12">Последние тренировки</text>
    </svg>
  `;
}

function emptyChart(message) {
  return `<div class="empty">${message}</div>`;
}

function renderMovementBalance() {
  const counts = groupCounts(state.workouts);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0) || 1;
  const rows = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([group, count]) => {
      const percent = Math.round((count / total) * 100);
      return `
        <div class="balance-row">
          <header><span>${group}</span><strong>${percent}%</strong></header>
          <div class="bar"><span style="width: ${percent}%"></span></div>
        </div>
      `;
    })
    .join("");

  elements.movementBalance.innerHTML = rows || `<div class="empty">Загрузи пример или сохрани тренировку.</div>`;
}

function renderHistory() {
  const workouts = state.workouts.slice().reverse().slice(0, 8);
  elements.historyList.innerHTML = workouts.length
    ? workouts.map((workout) => `
      <article class="history-item">
        <div class="history-meta">
          <strong>${formatDate(workout.date)}</strong>
          <span>${readinessLabel(workout.readiness)}</span>
          <span>${doneSetCount(workout)}/${workoutSetCount(workout)} подходов</span>
          <span>RPE ${averageWorkoutRpe(workout) || "n/a"}</span>
          ${workout.sessionEffort ? `<span>${sessionEffortLabel(workout.sessionEffort)}</span>` : ""}
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

function monthlyStats(workouts) {
  const formatter = new Intl.DateTimeFormat("ru-RU", { month: "short", year: "2-digit" });
  const buckets = new Map();

  workouts.forEach((workout) => {
    const date = new Date(workout.date);
    const key = workout.date.slice(0, 7);
    const current = buckets.get(key) || { label: formatter.format(date), count: 0, volume: 0 };
    current.count += 1;
    current.volume += workoutVolume(workout);
    buckets.set(key, current);
  });

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);
}

function weeklyStats(workouts) {
  const buckets = new Map();

  workouts.forEach((workout) => {
    const date = new Date(workout.date);
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    const current = buckets.get(key) || { label: formatDate(key), count: 0 };
    current.count += 1;
    buckets.set(key, current);
  });

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);
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
  return exercises.find((exercise) => exercise.id === id) || exercises[0];
}

function allSets(workouts) {
  return workouts.flatMap((workout) => workout.exercises.flatMap((exercise) => exercise.sets));
}

function workoutVolume(workout) {
  return workout.exercises.reduce((sum, exercise) => sum + exerciseVolume(exercise), 0);
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

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}
