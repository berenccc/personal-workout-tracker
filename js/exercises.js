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
