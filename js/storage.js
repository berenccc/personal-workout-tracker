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
