function renderCoach() {
  const readiness = elements.readinessInput.value;
  elements.readinessPill.textContent = readinessLabel(readiness);
  elements.readinessPill.className = `pill ${readiness === "good" ? "good" : readiness === "bad" ? "bad" : "warn"}`;
  renderWearableHint();

  const todayItems = itemsForDate(formatInputDate(new Date()));
  const fatigue = fatigueScore(state.workouts);
  const next = recommendationCards(todayItems, readiness, fatigue);
  elements.coachBox.innerHTML = next.map((item) => `
    <article class="coach-card">
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.text)}</p>
    </article>
  `).join("");
}

// ── AI-тренер: чат-агент с инструментами ────────────────────────────

function recommendationCards(todayItems, readiness, fatigue) {
  const last = lastWorkoutBeforeToday();
  const signals = last ? noteSignals(last) : {};
  const todayName = todayItems.length ? trainingTitle(todayItems) : "";
  const hitsToday = commentHitsToday(signals, todayName);
  const easeOff = readiness === "bad" || signals.wiped || fatigue >= 8 || (signals.pain && hitsToday);
  return [
    todayAdviceCard(todayItems, last, signals, easeOff, todayName),
    {
      title: `Индекс усталости: ${fatigue}/10`,
      text: fatigueText(fatigue, signals),
    },
  ];
}

function todayAdviceCard(todayItems, last, signals, easeOff, todayName) {
  const lastLine = last
    ? `Прошлая ${formatDate(last.date)} — ${trainingTitle(last.exercises || [])}${lastRpeBit(last)}.`
    : "Рядом нет сохранённой тренировки.";

  if (!todayItems.length) {
    return {
      title: "На сегодня список не собран",
      text: `${lastLine} Собери упражнения на эту дату — тон подстроится под них.`,
    };
  }

  const carry = carryLine(signals, todayName);
  if (easeOff) {
    const cut = signals.pain && commentHitsToday(signals, todayName)
      ? "Жимовые и то, что задевает эту зону, оставь в плане, но RPE 6–7. Если в рабочем подходе тянет — остановись, не добивай."
      : "Список не переписывай: RPE 6–7, без шага вверх и без отказа. Где уже тяжело на разминке — сними один подход.";
    return {
      title: `Сегодня ${todayName}: спокойнее`,
      text: `${lastLine} ${carry}${cut}`,
    };
  }

  if (signals.easy && !signals.pain) {
    return {
      title: `Сегодня ${todayName}`,
      text: `${lastLine} ${carry}Если рабочий подход легче 7, добавь маленький шаг только в нём. Отказ не нужен.`,
    };
  }

  return {
    title: `Сегодня ${todayName}`,
    text: `${lastLine} ${carry}Иди по плану: RPE 7–8, последний повтор с запасом. Веса из списка вверх не крути.`,
  };
}

function fatigueText(fatigue) {
  const recent = recentWorkoutWindow();
  const rpes = recent.map((workout) => averageWorkoutRpe(workout)).filter(Boolean);
  const avg = rpes.length ? rpes.reduce((sum, value) => sum + value, 0) / rpes.length : 0;
  const from = recent[0] ? formatDate(recent[0].date) : "";
  const base = recent.length
    ? `${recent.length} ${plural(recent.length, "тренировка", "тренировки", "тренировок")} с ${from}${avg ? `, средний RPE ${avg.toFixed(1)}` : ""}`
    : "Свежих тренировок мало";
  if (fatigue >= 8) return `${base}. Усталость высокая: сегодня объём не добавляй.`;
  if (fatigue >= 6) return `${base}. Запас тонкий: план можно закрыть, рекорд не нужен.`;
  return `${base}. Восстановление нормальное, сегодняшний список можно сделать целиком.`;
}

function carryLine(signals, todayName) {
  if (!signals) return "";
  const focus = signals.focus || [];
  const hits = focus.filter((part) => todayAreas(todayName).includes(part));
  const where = focus.slice(0, 2).join(" и ");
  if (signals.pain && hits.length) return `Из комментария на сегодня влияет: ${hits.slice(0, 2).join(" и ")}. `;
  if (signals.pain && where) return `Комментарий про ${where} на сегодняшнюю ${todayName.toLowerCase()} не переносится. `;
  if (signals.pain) return "В комментарии есть про тело, без одной зоны. ";
  if (signals.pump && !hits.length) return `Забитость с прошлой сессии на сегодняшнюю ${todayName.toLowerCase()} не влияет. `;
  if (signals.wiped) return "Прошлая сессия была тяжёлой. ";
  if (signals.easy && hits.length) return "По этой зоне в прошлый раз был запас. ";
  return "";
}

function commentHitsToday(signals, todayName) {
  if (!signals?.pain) return false;
  const focus = signals.focus || [];
  if (!focus.length) return true;
  return focus.some((part) => todayAreas(todayName).includes(part));
}

function todayAreas(title) {
  const text = String(title || "").toLowerCase();
  const areas = new Set();
  if (text.includes("грудь")) ["грудь", "плечи"].forEach((area) => areas.add(area));
  if (text.includes("плеч")) areas.add("плечи");
  if (text.includes("спин")) ["спина", "руки"].forEach((area) => areas.add(area));
  if (text.includes("рук")) areas.add("руки");
  if (text.includes("ног")) areas.add("ноги");
  if (text.includes("верх")) ["грудь", "спина", "плечи", "руки"].forEach((area) => areas.add(area));
  if (text.includes("всё")) ["грудь", "спина", "плечи", "руки", "ноги"].forEach((area) => areas.add(area));
  if (text.includes("кор")) areas.add("кор");
  return [...areas];
}

function commentFocus(text) {
  const areas = [];
  const add = (area) => { if (!areas.includes(area)) areas.push(area); };
  if (/тяг|спин|широк/.test(text)) add("спина");
  if (/бицепс/.test(text) && !/бедр/.test(text)) add("руки");
  if (/трицепс|локт/.test(text)) add("руки");
  if (/груд|жим\s+л[её]ж|наклонн/.test(text)) add("грудь");
  if (/плеч|дельт/.test(text)) add("плечи");
  if (/ног|бедр|квадр|ягоди|икр|колен/.test(text)) add("ноги");
  if (/кор|пресс/.test(text)) add("кор");
  return areas;
}

function lastWorkoutBeforeToday() {
  const today = formatInputDate(new Date());
  return [...state.workouts].reverse().find((workout) => workout.date < today) || null;
}

function recentWorkoutWindow() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 10);
  const iso = formatInputDate(cutoff);
  return state.workouts.filter((workout) => workout.date >= iso && workout.date < formatInputDate(new Date())).slice(-3);
}

function noteSignals(workout) {
  const text = `${workout?.afterNotes || ""} ${workout?.notes || ""}`.toLowerCase();
  const painBits = text.split(/[.!?\n]+/).map((part) => part.trim()).filter((part) => {
    if (!part) return false;
    if (/не\s+проблем|без\s+боли|не\s+бол|не\s+тян|нормально|всё ок|все ок/.test(part)) return false;
    if (/забил|забились|подзабив/.test(part) && !/боль|болит|тянуло|потянул|травм/.test(part)) return false;
    return /боль|болит|болел|болело|колен|плеч|локт|сустав|тянет|тянуло|потянул|ныл|ныло|травм/.test(part);
  });
  return {
    pain: painBits.length > 0,
    pump: /забил|забились|подзабив/.test(text),
    wiped: workout?.sessionEffort === "too-hard" || /устал|перебор|выжат|разбит|не восстановил/.test(text),
    easy: workout?.sessionEffort === "fresh" || /легко|бодро|\bзапас\b/.test(text),
    focus: commentFocus(text),
  };
}

function lastRpeBit(workout) {
  const rpe = averageWorkoutRpe(workout);
  return rpe ? `, RPE ${rpe}` : "";
}
