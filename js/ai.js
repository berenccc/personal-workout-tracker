function isTouchDevice() {
  return window.matchMedia?.("(pointer: coarse)").matches;
}

function getAiApiKey() {
  return (localStorage.getItem(AI_KEY_STORAGE) || "").trim();
}

function getAiBaseUrl() {
  return (localStorage.getItem(AI_BASE_STORAGE) || AI_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function saveAiApiKey() {
  const key = (elements.aiApiKeyInput?.value || "").trim();
  if (!key) {
    localStorage.removeItem(AI_KEY_STORAGE);
    setAiStatus("AI key удалён с этого устройства.");
    updateCabinetStatus();
    return;
  }

  localStorage.setItem(AI_KEY_STORAGE, key);
  elements.aiApiKeyInput.value = "";
  setAiStatus("AI key сохранён. Он хранится только в этом браузере.");
  updateCabinetStatus();
}

function saveAiBaseUrl() {
  const value = (elements.aiBaseUrlInput?.value || "").trim().replace(/\/+$/, "");
  if (!value) {
    localStorage.removeItem(AI_BASE_STORAGE);
    if (elements.aiBaseUrlInput) elements.aiBaseUrlInput.value = "";
    setAiStatus("AI URL сброшен: снова использую api.openai.com.");
    return;
  }

  if (!/^https:\/\/.+/i.test(value)) {
    setAiStatus("AI URL должен начинаться с https://");
    return;
  }

  localStorage.setItem(AI_BASE_STORAGE, value);
  setAiStatus(`AI URL сохранён: ${value}`);
}

function initAiCoach() {
  if (elements.aiBaseUrlInput) {
    elements.aiBaseUrlInput.value = localStorage.getItem(AI_BASE_STORAGE) || "";
  }
  loadPendingAiPlan();
  renderAiChat();
  setAiStatus(getAiApiKey() ? "" : "Ключ AI — в Кабинете, без входа и лимитов.");
}

function setAiStatus(text) {
  elements.aiStatus.textContent = text;
}

function loadAiChat() {
  try {
    const saved = JSON.parse(localStorage.getItem(AI_CHAT_STORAGE));
    return Array.isArray(saved) ? saved.filter((m) => m?.role && m?.content) : [];
  } catch {
    return [];
  }
}

function persistAiChat() {
  aiChat = aiChat.slice(-AI_CHAT_HISTORY_LIMIT);
  localStorage.setItem(AI_CHAT_STORAGE, JSON.stringify(aiChat));
}

function clearAiChat() {
  aiChat = [];
  localStorage.removeItem(AI_CHAT_STORAGE);
  aiError = "";
  dropPendingAiPlan();
  renderAiChat();
  setAiStatus("");
}

let aiThinking = false;
let aiError = "";

// План от AI сначала попадает сюда и ждёт кнопки «Принять»: сам он ничего не меняет.
let pendingAiPlan = null;

function loadPendingAiPlan() {
  try {
    const saved = JSON.parse(localStorage.getItem(AI_PENDING_PLAN_KEY));
    pendingAiPlan = Array.isArray(saved?.exercises) && saved.exercises.length ? saved : null;
  } catch {
    pendingAiPlan = null;
  }
  if (!pendingAiPlan) localStorage.removeItem(AI_PENDING_PLAN_KEY);
}

function storePendingAiPlan(plan) {
  pendingAiPlan = plan;
  localStorage.setItem(AI_PENDING_PLAN_KEY, JSON.stringify(plan));
}

function dropPendingAiPlan() {
  pendingAiPlan = null;
  localStorage.removeItem(AI_PENDING_PLAN_KEY);
}

function pendingPlanLines(plan) {
  return (plan?.exercises || []).map((item, index) => {
    const exercise = findExercise(item.exerciseId);
    const sets = (item.sets || [])
      .map((set) => `${formatNumber(set.weight)}×${set.reps}${set.rpe ? ` @ RPE ${set.rpe}` : ""}`)
      .join(", ");
    return `${index + 1}. ${exercise?.name || item.exerciseId}: ${sets}`;
  });
}

function describePendingPlanForChat() {
  if (!pendingAiPlan) return "";
  return ["Предлагаю такой план:", ...pendingPlanLines(pendingAiPlan)].join("\n");
}

function pendingPlanCard() {
  if (!pendingAiPlan) return "";
  const rows = pendingPlanLines(pendingAiPlan)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");
  return `
    <div class="ai-plan-offer">
      <p class="ai-plan-offer-title">Новый план ждёт подтверждения</p>
      ${pendingAiPlan.notes ? `<p class="ai-plan-offer-note">${escapeHtml(pendingAiPlan.notes)}</p>` : ""}
      <ol class="ai-plan-offer-list">${rows}</ol>
      <div class="ai-plan-offer-actions">
        <button class="button" type="button" data-ai-plan="accept">Принять план</button>
        <button class="button ghost" type="button" data-ai-plan="decline">Отклонить</button>
      </div>
    </div>
  `;
}

function acceptPendingAiPlan() {
  if (!pendingAiPlan) return;

  const valid = pendingAiPlan.exercises.filter((item) => findExercise(item.exerciseId));
  if (!valid.length) {
    dropPendingAiPlan();
    renderAiChat();
    showToast("В плане нет знакомых упражнений", "warn");
    return;
  }

  selected = valid.map((item) =>
    planEntry(item.exerciseId, (item.sets || []).map((set) => [set.weight, set.reps, set.rpe ?? ""]))
  );
  if (pendingAiPlan.notes) elements.notesInput.value = pendingAiPlan.notes;

  dropPendingAiPlan();
  renderSelectedExercises();
  persistAiPlan();
  saveWorkoutDraft();
  localStorage.removeItem(AI_POST_WORKOUT_PENDING_KEY);
  render();
  aiChat.push({ role: "assistant", content: "План принят — он уже на главной." });
  persistAiChat();
  renderAiChat();
  setAiStatus("План принят — он на главной.");
  showToast("План принят ✓");
}

function declinePendingAiPlan() {
  if (!pendingAiPlan) return;
  dropPendingAiPlan();
  localStorage.removeItem(AI_POST_WORKOUT_PENDING_KEY);
  aiChat.push({ role: "assistant", content: "План отклонён. Скажи, что поменять — предложу другой." });
  persistAiChat();
  renderAiChat();
  setAiStatus("План отклонён. Скажи, что поменять.");
  showToast("План отклонён");
}

function aiErrorBubble() {
  return `
    <div class="ai-msg ai-msg-bot ai-msg-error">
      <p>Не получилось: ${escapeHtml(aiError)}</p>
      <button class="button secondary ai-retry-button" type="button">Повторить</button>
    </div>
  `;
}

function aiTypingBubble() {
  return `
    <div class="ai-msg ai-msg-bot ai-msg-typing" aria-label="Тренер печатает">
      <span></span><span></span><span></span>
    </div>
  `;
}

function renderAiChat() {
  if (!aiChat.length && !aiThinking) {
    elements.aiChatLog.innerHTML = `
      <div class="ai-chat-empty">
        Это твой AI-тренер: он сам смотрит историю тренировок и план в приложении.
        Примеры: «оцени последнюю тренировку», «дай фидбэк по неделе», «запланируй следующую»,
        «замени жим ногами», «добавь упражнение на спину», «сделай план полегче».
      </div>
    ` + pendingPlanCard();
    return;
  }

  const bubbles = aiChat
    .map((message) => {
      const body = escapeHtml(message.content).replace(/\n/g, "<br>");
      return `<div class="ai-msg ${message.role === "user" ? "ai-msg-user" : "ai-msg-bot"}">${body}</div>`;
    })
    .join("");
  // Предложенный план остаётся доступным, даже если последний запрос упал:
  // иначе принять его уже нечем, хотя он уже собран.
  elements.aiChatLog.innerHTML =
    bubbles +
    (aiThinking ? aiTypingBubble() : aiError ? aiErrorBubble() : "") +
    pendingPlanCard();
  scrollAiChatToBottom();
}

// Лента не всегда прокручивается сама (страница может скроллиться целиком),
// поэтому двигаем последний пузырь и оставляем место под липким полем ввода.
function scrollAiChatToBottom() {
  const log = elements.aiChatLog;
  const last = log?.lastElementChild;
  if (!last) return;
  const composer = document.querySelector(".ai-chat-composer");
  const run = () => {
    last.style.scrollMarginBottom = `${(composer?.offsetHeight || 120) + 24}px`;
    log.scrollTop = log.scrollHeight;
    last.scrollIntoView({ block: "end" });
  };
  run();
  window.requestAnimationFrame(run);
  window.setTimeout(run, 220);
}

const AI_SYSTEM_PROMPT = `Ты — персональный AI-тренер внутри приложения-трекера тренировок. Ты общаешься на русском, понимаешь разговорные и синонимичные формулировки: «оцени тренировку» = «дай фидбэк» = «разбери сессию» = «как я отработал»; «запланируй» = «составь план» = «накидай тренировку» = «что делать в следующий раз»; «замени/поменяй/убери/добавь упражнение», «сделай легче/тяжелее/короче». Если просьба неоднозначна, задай один короткий уточняющий вопрос, иначе действуй сразу. Выполняй именно то, о чём попросили: если просят добавить упражнение на конкретную группу мышц — добавь упражнение именно этой группы, даже если она уже есть в плане. Синонимы групп: «пресс/живот/кор» → Кор (dead-bug, ab-wheel, plank, side-plank, bird-dog, overhead-plate); «спина» → тяги и гравитрон; «ноги» → жим ногами, сгибание/разгибание ног, выпады; «грудь» → жимы и баттерфляй; «плечи» → жим вверх, дельта-машина; «руки» → бицепс, трицепс.

МОЖНО ОТВЕЧАТЬ НА ЛЮБЫЕ ВОПРОСЫ ПОЛЬЗОВАТЕЛЯ. Для вопросов о тренировках, здоровье, питании, восстановлении и плане используй контекст приложения и инструменты, когда это уместно. Для прочих тем отвечай как обычный полезный AI-помощник; не вызывай тренировочные инструменты, если они не нужны.

ПРОФИЛЬ АТЛЕТА: мужчина, тренируется в зале 2-3 раза в неделю на тренажёрах, гантелях и штанге. Цель — форма, самочувствие и сила без выгорания и без работы в отказ. Не любит farmer-carry. В зале есть гравитрон, жимы/тяги на тренажёрах, Belt Squat, Glute Drive, Hip&Glute, сгибания/разгибания ног, пресс/вращение корпуса, кардио (эллипс, вело, гребля, степпер, аэробайк), канаты, плюс свободные веса, перекладина, брусья, резинки и мячи — бери упражнения только из «Моего зала» / get_exercise_catalog. История знает случаи перегруза ЦНС, боли в левом плече и эпизод с правым коленом на жиме ногами — следи за этими сигналами. Если в контексте есть данные Mi Band (сон, пульс покоя, пульс сессии) — учитывай их в нагрузке: короткий сон или высокий пульс покоя = легче, без героизма.

ИНСТРУМЕНТЫ: у тебя есть функции. Прежде чем оценивать тренировку или менять план — ВСЕГДА сначала прочитай данные: get_recent_workouts (история), get_planned_workout (текущий план и статус тренировки), get_exercise_catalog (доступные упражнения и их id). Для последней тренировки и ближайшего плана запрашивай подробные 3–12 сессий через count. Для вопросов о прогрессе, плато, рекордах, балансе нагрузки и долгосрочном планировании дополнительно вызывай get_recent_workouts с days: 365 — он вернёт компактную историю за год. Полную замену плана с нуля делай через set_planned_workout. Точечные правки текущего плана применяй сразу: добавить — add_exercise_to_plan, заменить упражнение или его подходы — update_exercise_in_plan, убрать — remove_exercise_from_plan, поменять порядок — reorder_plan. ВАЖНО: set_planned_workout НЕ меняет план сразу — он показывает предложение с кнопкой «Принять план», и пользователь решает сам. Поэтому после вызова не пиши «план сохранён/обновлён»; скажи, что предложил план и ждёшь подтверждения. add_exercise_to_plan применяется сразу, потому что о нём просят явно. Используй только exerciseId из каталога. На оффтоп-запросах инструменты не вызывай.

НОВЫЕ УПРАЖНЕНИЯ: если пользователь встретил в зале тренажёр или упражнение, которого нет в каталоге («тут стоит хаммер», «добавь тягу Т-грифа», «есть новый тренажёр на икры»), — добавь его через add_new_exercise (подбери группу, единицу и шаг веса), а затем, если уместно, сразу поставь в текущую тренировку через add_exercise_to_plan с консервативными весами для первого знакомства (RPE 6-7, «прощупать» вес).

ВО ВРЕМЯ АКТИВНОЙ ТРЕНИРОВКИ (статус «тренировка идёт»): не вызывай set_planned_workout — он перезапишет отметки уже сделанных подходов. Добавляй, заменяй, удаляй и меняй порядок точечными инструментами: отметки подходов у упражнений, которые остаются, сохраняются.

МЕТОДИКА (научная база: позиция ACSM и мета-анализы по гипертрофии/силе):
- Объём: 10-20 рабочих подходов на мышечную группу в неделю, 2-3 подхода на упражнение, 8-20 повторов (в основном 6-12). Больше 20 подходов в неделю на группу — убывающая отдача.
- Интенсивность: рабочие подходы RPE 6-8 (2-4 повтора в запасе). RPE 9-10 и отказ — только как редкое исключение, не планируй их.
- Прогрессия: дабл-прогрессия — сначала +1-2 повтора в диапазоне, затем +2.5 кг (ноги +5-10 кг) и назад к нижней границе повторов. Прогресс только если RPE ≤ 8 и техника чистая.
- Восстановление: мышечной группе 48+ часов между тяжёлыми сессиями; отдых между подходами 2-3 мин на базовых.
- Разгрузка: каждые 4-6 недель или при сигналах усталости (растущий RPE при тех же весах, плохой сон, нет желания идти в зал, itог too-hard) — неделя с −30-50% объёма.
- Боль: при острой боли убрать провоцирующее движение, подобрать безболевую замену; при повторяющейся боли посоветовать врача. Дискомфорт в левом плече → осторожнее с жимами над головой и глубоким жимом.

СТИЛЬ ОТВЕТА: кратко, для чтения с телефона. 2-6 коротких абзацев или строк, без markdown-разметки (#, *, -, **). Конкретные цифры: веса, повторы, целевой RPE. Хвали за реальный прогресс, честно указывай на риски (пики RPE 9-10, лишний объём, слишком частые тренировки одной группы).`;

const AI_TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "get_live_status",
      description: "Что происходит прямо сейчас: текущее время, идёт ли тренировка и сколько длится, остаток отдыха, пульс с браслета, текущее упражнение и подход, прогресс по подходам, что играет в YouTube Music и громкость.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "control_music",
      description: "Управление музыкой в YouTube Music на телефоне. Используй, когда просят переключить трек, поставить на паузу, сделать громче/тише или включить конкретного артиста, трек, плейлист или настроение (search).",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: AI_MUSIC_ACTIONS },
          query: { type: "string", description: "Для search: что включить, например «Eminem», «плейлист для качалки», «фонк»." },
          steps: { type: "integer", description: "Для volumeUp/volumeDown: на сколько делений, 1-10. По умолчанию 1." },
          percent: { type: "integer", description: "Для setVolume: громкость в процентах, 0-100." },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_workouts",
      description: "История тренировок. С параметром count возвращает подробно последние 1–12 сессий. С параметром days возвращает компактную историю за период до 365 дней; используй days=365 для прогресса, плато, рекордов и долгосрочного планирования.",
      parameters: {
        type: "object",
        properties: {
          count: { type: "integer", description: "Сколько последних тренировок вернуть, 1-12. По умолчанию 3." },
          days: { type: "integer", description: "Период компактной истории в днях, 1-365. Если указан, имеет приоритет над count." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_planned_workout",
      description: "Текущий план следующей тренировки в приложении: дата, заметка-фокус, упражнения и целевые подходы.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_exercise_catalog",
      description: "Каталог доступных упражнений: exerciseId, название, группа мышц, единица веса. Только эти exerciseId можно использовать в set_planned_workout.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "add_new_exercise",
      description: "Добавляет новое упражнение в каталог приложения (например незнакомый тренажёр, которого нет в get_exercise_catalog). Возвращает exerciseId нового упражнения — после этого его можно ставить в план.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Название по-русски, как его увидит пользователь. Например: «Хаммер жим сидя»." },
          group: { type: "string", enum: ["Ноги", "Икры", "Спина", "Грудь", "Плечи", "Задняя цепь", "Функционал", "Руки", "Кор", "Плиометрика", "Кардио", "Другое"], description: "Группа мышц/тип." },
          unit: { type: "string", description: "Единица нагрузки: «кг», «кг/рука», «кг противовес», «мин», «повторы». По умолчанию «кг»." },
          step: { type: "number", description: "Шаг изменения веса в кг (обычно 2.5; для тренажёров с большими плитками 5)." },
        },
        required: ["name", "group"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_exercise_to_plan",
      description: "Добавляет ОДНО упражнение с подходами в конец текущего плана/тренировки, не трогая остальные упражнения и отметки выполнения. Используй для точечных добавлений, особенно когда тренировка уже идёт.",
      parameters: {
        type: "object",
        properties: {
          exerciseId: { type: "string", description: "id из get_exercise_catalog или из ответа add_new_exercise" },
          sets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                weight: { type: "number", description: "Вес в кг (для кардио — минуты)" },
                reps: { type: "integer", description: "Повторы (для кардио — 1)" },
                rpe: { type: "number", description: "Целевой RPE 5-8" },
              },
              required: ["weight", "reps"],
            },
          },
        },
        required: ["exerciseId", "sets"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_exercise_in_plan",
      description: "Заменяет одно упражнение в текущем плане другим или меняет только его подходы. Остальные упражнения и отметки их подходов не трогает. Применяется сразу, когда пользователь просит заменить, поменять или переделать упражнение. Укажи position (номер с 1 из get_planned_workout) или exerciseId того, что меняешь.",
      parameters: {
        type: "object",
        properties: {
          position: { type: "integer", description: "Номер упражнения в плане, с 1." },
          exerciseId: { type: "string", description: "id упражнения, которое меняешь, если номер не указан." },
          newExerciseId: { type: "string", description: "id замены из каталога. Не передавай, если нужно поменять только подходы." },
          sets: {
            type: "array",
            description: "Новые подходы. Если не передать при замене упражнения, вес и повторы копируются.",
            items: {
              type: "object",
              properties: {
                weight: { type: "number" },
                reps: { type: "integer" },
                rpe: { type: "number" },
              },
              required: ["weight", "reps"],
            },
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_exercise_from_plan",
      description: "Удаляет одно упражнение из текущего плана. Остальные упражнения и отметки их подходов не трогает. Применяется сразу, когда пользователь просит убрать или удалить упражнение. Чтобы убрать несколько, вызови по разу на каждое и передавай exerciseId: после каждого удаления номера сдвигаются.",
      parameters: {
        type: "object",
        properties: {
          exerciseId: { type: "string", description: "id упражнения, которое удаляешь. Предпочтительный способ." },
          position: { type: "integer", description: "Номер упражнения в плане, с 1 — только если одно и то же упражнение стоит в плане дважды." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reorder_plan",
      description: "Меняет порядок упражнений текущего плана. Передай полный список exerciseId в новом порядке, по одному на каждое упражнение. Подходы и отметки выполнения сохраняются. Применяется сразу.",
      parameters: {
        type: "object",
        properties: {
          exerciseIds: {
            type: "array",
            items: { type: "string" },
            description: "Все exerciseId плана в новом порядке.",
          },
        },
        required: ["exerciseIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_planned_workout",
      description: "Полностью заменяет план следующей тренировки в приложении (упражнения, подходы, целевые RPE, заметку). Вызывай, когда пользователь попросил запланировать или изменить тренировку.",
      parameters: {
        type: "object",
        properties: {
          notes: { type: "string", description: "Короткая заметка-фокус тренировки (1-2 предложения, по-русски)." },
          exercises: {
            type: "array",
            description: "Упражнения по порядку выполнения.",
            items: {
              type: "object",
              properties: {
                exerciseId: { type: "string", description: "id из get_exercise_catalog" },
                sets: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      weight: { type: "number", description: "Вес в кг (для кардио — минуты)" },
                      reps: { type: "integer", description: "Повторы (для кардио — 1)" },
                      rpe: { type: "number", description: "Целевой RPE 5-8" },
                    },
                    required: ["weight", "reps"],
                  },
                },
              },
              required: ["exerciseId", "sets"],
            },
          },
        },
        required: ["exercises"],
      },
    },
  },
];

function persistAiPlan() {
  localStorage.setItem(
    AI_PLAN_STORAGE,
    JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      planDate: elements.dateInput.value || formatInputDate(new Date()),
      notes: elements.notesInput.value,
      exercises: selected.map((item) => ({
        exerciseId: item.exerciseId,
        sets: item.sets.map((set) => ({ weight: set.weight, reps: set.reps, rpe: set.rpe })),
      })),
    })
  );
}

function applyStoredAiPlan() {
  let plan;
  try {
    plan = JSON.parse(localStorage.getItem(AI_PLAN_STORAGE));
  } catch {
    localStorage.removeItem(AI_PLAN_STORAGE);
    return;
  }
  const today = formatInputDate(new Date());
  if (!plan || plan.version !== 1 || !Array.isArray(plan.exercises) || !plan.exercises.length) {
    editingPlanIso = elements.dateInput.value;
    loadDayPlanIntoSelected(editingPlanIso);
    return;
  }

  // План выполнен: после его сохранения появилась тренировка на эту дату или позже.
  const planDate = plan.planDate || formatInputDate(new Date(plan.savedAt || Date.now()));
  if (state.workouts.some((workout) => workout.date >= planDate)) {
    localStorage.removeItem(AI_PLAN_STORAGE);
    editingPlanIso = elements.dateInput.value;
    loadDayPlanIntoSelected(editingPlanIso);
    return;
  }

  const valid = plan.exercises.filter((item) => findExercise(item.exerciseId));
  if (planDate >= today) elements.dateInput.value = planDate;
  const iso = elements.dateInput.value;
  if (!valid.length) {
    editingPlanIso = iso;
    loadDayPlanIntoSelected(iso);
    return;
  }

  if (!dayPlans[iso]?.exercises?.length) {
    selected = valid.map((item) =>
      planEntry(item.exerciseId, (item.sets || []).map((set) => [set.weight, set.reps, set.rpe ?? ""]))
    );
    if (typeof plan.notes === "string" && plan.notes.trim()) elements.notesInput.value = plan.notes;
    writeDayPlan(iso, selected);
  }
  editingPlanIso = iso;
  loadDayPlanIntoSelected(iso);
}

function describeWorkoutForAi(workout) {
  const durationMinutes = workout.durationMinutes ||
    (workout.durationMs ? Math.max(1, Math.round(workout.durationMs / 60000)) : null);
  const header = `${workout.date} · готовность: ${workout.readiness || "?"} · итог: ${workout.sessionEffort || "?"}${durationMinutes ? ` · ${durationMinutes} мин` : ""}`;
  const lines = (workout.exercises || []).map((item) => {
    const exercise = findExercise(item.exerciseId);
    const sets = (item.sets || [])
      .map((set) => {
        const status = set.done === false ? "не сделан" : "сделан";
        const mark = setMarkLabel(set.mark || "normal");
        return `${formatNumber(set.weight)}x${set.reps}${set.rpe ? `@${set.rpe}` : ""} (${status}, метка: ${mark})`;
      })
      .join(", ");
    return `  - ${exercise ? exercise.name : item.exerciseId}: ${sets}`;
  });
  return [
    header,
    workout.notes ? `  заметки до: ${workout.notes}` : null,
    workout.afterNotes ? `  заметки после: ${workout.afterNotes}` : null,
    wearableReportLine(workout.wearable) ? `  ${wearableReportLine(workout.wearable)}` : null,
    ...lines,
  ].filter(Boolean).join("\n");
}

function bestSetForAi(item, exercise) {
  const completed = (item.sets || []).filter((set) => set.done !== false);
  const sets = completed.length ? completed : (item.sets || []);
  return sets.reduce((best, set) => {
    if (!best) return set;
    if (exercise?.lowerIsBetter) {
      return Number(set.weight) < Number(best.weight) ? set : best;
    }
    return Number(set.weight) > Number(best.weight) ||
      (Number(set.weight) === Number(best.weight) && Number(set.reps) > Number(best.reps))
      ? set
      : best;
  }, null);
}

function setForAi(set) {
  return set
    ? `${formatNumber(set.weight)}x${set.reps}${set.rpe ? `@${set.rpe}` : ""}`
    : "нет данных";
}

function buildPeriodHistoryForAi(period, days) {
  const monthly = new Map();
  const byExercise = new Map();
  const safetyNotes = [];

  period.forEach((workout) => {
    const month = workout.date.slice(0, 7);
    const monthStats = monthly.get(month) || { sessions: 0, sets: 0, rpes: [] };
    monthStats.sessions += 1;
    monthStats.sets += workoutSetCount(workout);
    monthStats.rpes.push(...(workout.exercises || []).flatMap((item) =>
      (item.sets || []).map((set) => Number(set.rpe)).filter(Boolean)
    ));
    monthly.set(month, monthStats);

    (workout.exercises || []).forEach((item) => {
      const exercise = findExercise(item.exerciseId);
      const representative = bestSetForAi(item, exercise);
      if (!representative) return;
      const stats = byExercise.get(item.exerciseId) || {
        exercise,
        sessions: 0,
        first: null,
        latest: null,
        best: null,
        rpes: [],
      };
      const point = { date: workout.date, set: representative };
      stats.sessions += 1;
      stats.first ||= point;
      stats.latest = point;
      stats.rpes.push(...(item.sets || []).map((set) => Number(set.rpe)).filter(Boolean));
      if (!stats.best) {
        stats.best = point;
      } else {
        const current = stats.best.set;
        const better = exercise?.lowerIsBetter
          ? Number(representative.weight) < Number(current.weight)
          : Number(representative.weight) > Number(current.weight) ||
            (Number(representative.weight) === Number(current.weight) &&
              Number(representative.reps) > Number(current.reps));
        if (better) stats.best = point;
      }
      byExercise.set(item.exerciseId, stats);
    });

    const note = [workout.notes, workout.afterNotes].filter(Boolean).join(" | ");
    if (note && /бол|колен|плеч|травм|пульс|голов|цнс|перегруз|отказ|rpe\s*(?:9|10)|тяжел|плохо/i.test(note)) {
      safetyNotes.push(`${workout.date}: ${note.slice(0, 220)}`);
    }
  });

  const monthLines = [...monthly.entries()].map(([month, stats]) =>
    `${month}: ${stats.sessions} сесс., ${stats.sets} подх., ср.RPE ${
      stats.rpes.length ? average(stats.rpes).toFixed(1) : "н/д"
    }`
  );
  const exerciseLines = [...byExercise.values()]
    .sort((a, b) => b.sessions - a.sessions)
    .map((stats) =>
      `${stats.exercise?.name || "Упражнение"}: ${stats.sessions} сесс.; ` +
      `старт ${stats.first.date} ${setForAi(stats.first.set)}; ` +
      `последний ${stats.latest.date} ${setForAi(stats.latest.set)}; ` +
      `лучший ${stats.best.date} ${setForAi(stats.best.set)}; ` +
      `ср.RPE ${stats.rpes.length ? average(stats.rpes).toFixed(1) : "н/д"}`
    );
  const timeline = period.map((workout) => {
    const rpes = (workout.exercises || []).flatMap((item) =>
      (item.sets || []).map((set) => Number(set.rpe)).filter(Boolean)
    );
    return `${workout.date}(${workout.readiness || "?"}/${workout.sessionEffort || "?"},` +
      `${workoutSetCount(workout)}п,RPE${rpes.length ? average(rpes).toFixed(1) : "?"})`;
  });

  return [
    `История за ${days} дней: ${period.length} тренировок, ${period[0].date} — ${period.at(-1).date}.`,
    `Хронология всех сессий: ${timeline.join(" ")}`,
    "Помесячная нагрузка:",
    ...monthLines,
    "Прогресс по упражнениям:",
    ...exerciseLines,
    ...(safetyNotes.length ? ["Важные заметки о боли/усталости:", ...safetyNotes.slice(-20)] : []),
  ].join("\n").slice(0, 15800);
}

function catalogExercise(id) {
  const resolved = EXERCISE_ALIASES[id] || id;
  return exercises.find((exercise) => exercise.id === resolved) || null;
}

function planOrderText(items = selected) {
  if (!items.length) return "план пуст";
  return items
    .map((item, index) => `${index + 1}. ${catalogExercise(item.exerciseId)?.name || item.exerciseId} (${item.exerciseId})`)
    .join("; ");
}

function planIndexFromArgs(args, items = selected) {
  if (!items.length) return { error: "План пуст, менять нечего." };
  const position = Number(args.position);
  if (Number.isInteger(position) && position >= 1 && position <= items.length) return { index: position - 1 };
  if (Number.isFinite(position) && position > 0) {
    return { error: `Позиции ${position} нет. Сейчас в плане ${items.length}: ${planOrderText(items)}.` };
  }
  const id = String(args.exerciseId || "").trim();
  if (!id) return { error: "Укажи position (номер с 1) или exerciseId упражнения." };
  const resolved = EXERCISE_ALIASES[id] || id;
  const matches = [];
  items.forEach((item, index) => {
    if (item.exerciseId === id || item.exerciseId === resolved) matches.push(index);
  });
  if (!matches.length) return { error: `В плане нет «${id}». Сейчас: ${planOrderText(items)}.` };
  if (matches.length > 1) return { error: `«${id}» стоит в плане ${matches.length} раза. Укажи position.` };
  return { index: matches[0] };
}

function currentPlanTarget() {
  return {
    items: selected,
    commit(next, message) {
      selected = next;
      return commitPlanEdit(message);
    },
  };
}

function pendingPlanTarget() {
  return {
    items: pendingAiPlan.exercises.map((item) =>
      planEntry(item.exerciseId, (item.sets || []).map((set) => [set.weight, set.reps, set.rpe ?? ""]))
    ),
    commit(next, message) {
      storePendingAiPlan({
        ...pendingAiPlan,
        exercises: next.map((item) => ({
          exerciseId: item.exerciseId,
          sets: item.sets.map((set) => ({ weight: set.weight, reps: set.reps, rpe: set.rpe ?? "" })),
        })),
      });
      renderAiChat();
      return `${message} Правка внесена в предложенный план — он всё ещё ждёт кнопки «Принять план». Сейчас: ${planOrderText(next)}.`;
    },
  };
}

// Правим то, что видно на главной. Непринятое предложение правим следом,
// иначе после «Принять план» убранное упражнение вернётся. Если на главной пусто,
// единственное, что есть, — само предложение.
function aiEditTargets() {
  const active = elements.workoutPanel.classList.contains("is-active");
  if (active || !pendingAiPlan) return { primary: currentPlanTarget() };
  if (!selected.length) return { primary: pendingPlanTarget() };
  return { primary: currentPlanTarget(), mirror: pendingPlanTarget() };
}

// Позиция в предложении может не совпадать с главной, поэтому зеркалим по exerciseId.
function argsForMirror(args, items) {
  const position = Number(args.position);
  if (!Number.isInteger(position) || !items[position - 1]) return args;
  const { position: _position, ...rest } = args;
  return { ...rest, exerciseId: items[position - 1].exerciseId };
}

function planEditOp(name, args, source) {
  const items = [...source];

  if (name === "add_exercise_to_plan") {
    const exercise = catalogExercise(args.exerciseId);
    if (!exercise) {
      return { error: `неизвестный exerciseId «${args.exerciseId}». Возьми id из get_exercise_catalog или сначала добавь упражнение через add_new_exercise.` };
    }
    const rows = rowsFromToolSets(args.sets);
    if (!rows.length) return { error: "не переданы подходы (weight, reps)." };
    items.push(planEntry(exercise.id, rows));
    return { items, message: `Добавил: ${exercise.name}, ${rows.length} подх. Остальные упражнения не тронуты.` };
  }

  if (name === "update_exercise_in_plan") {
    const located = planIndexFromArgs(args, items);
    if (located.error) return { error: located.error };
    const current = items[located.index];
    const nextId = String(args.newExerciseId || "").trim();
    const hasSets = Array.isArray(args.sets);
    if (!nextId && !hasSets) return { error: "передай newExerciseId (замена) и/или sets (новые подходы)." };

    const replacement = nextId ? catalogExercise(nextId) : catalogExercise(current.exerciseId);
    if (!replacement) return { error: `неизвестный exerciseId «${nextId}». Возьми id из get_exercise_catalog.` };

    const previousName = catalogExercise(current.exerciseId)?.name || current.exerciseId;
    const doneCount = current.sets.filter((set) => set.done).length;
    const replacing = replacement.id !== current.exerciseId;
    let rows = current.sets.map((set) => [set.weight, set.reps, set.rpe ?? ""]);
    if (hasSets) {
      rows = rowsFromToolSets(args.sets);
      if (!rows.length) return { error: "не переданы подходы (weight, reps)." };
    }
    items[located.index] = { ...planEntry(replacement.id, rows.length ? rows : [[0, 10, ""]]), uid: current.uid };

    const dropped = doneCount ? ` Сбросил ${doneCount} уже отмеченных подходов у этого упражнения.` : "";
    const action = replacing
      ? `Заменил «${previousName}» на «${replacement.name}».`
      : `Обновил подходы у «${replacement.name}».`;
    return { items, message: `${action}${dropped}` };
  }

  if (name === "remove_exercise_from_plan") {
    const located = planIndexFromArgs(args, items);
    if (located.error) return { error: located.error };
    const [removed] = items.splice(located.index, 1);
    const title = catalogExercise(removed.exerciseId)?.name || removed.exerciseId;
    const doneCount = removed.sets.filter((set) => set.done).length;
    return { items, message: `Убрал «${title}».${doneCount ? ` У него было ${doneCount} отмеченных подходов.` : ""}` };
  }

  if (name === "reorder_plan") {
    const ids = Array.isArray(args.exerciseIds) ? args.exerciseIds.map((id) => String(id)) : [];
    if (ids.length !== items.length) {
      return { error: `нужен полный список из ${items.length} exerciseId в новом порядке. Сейчас: ${planOrderText(items)}.` };
    }
    const pool = items.map((item) => ({ item, used: false }));
    const next = [];
    for (const id of ids) {
      const resolved = EXERCISE_ALIASES[id] || id;
      const found = pool.find((entry) => !entry.used && (entry.item.exerciseId === id || entry.item.exerciseId === resolved));
      if (!found) return { error: `«${id}» нет в плане или он указан лишний раз. Сейчас: ${planOrderText(items)}.` };
      found.used = true;
      next.push(found.item);
    }
    if (next.every((item, index) => item === items[index])) return { unchanged: `Порядок уже такой. Сейчас: ${planOrderText(items)}.` };
    return { items: next, message: "Поменял порядок. Отметки подходов сохранены." };
  }

  return { error: `неизвестный инструмент ${name}.` };
}

function applyAiPlanEdit(name, args) {
  const { primary, mirror } = aiEditTargets();
  const result = planEditOp(name, args, primary.items);
  if (result.error) return `Ошибка: ${result.error}`;
  if (result.unchanged) return result.unchanged;

  let note = "";
  if (mirror) {
    const mirrored = planEditOp(name, argsForMirror(args, primary.items), mirror.items);
    if (mirrored.items) {
      mirror.commit(mirrored.items, "");
      note = " То же изменение внесено в предложенный план, который ждёт «Принять план».";
    }
  }
  return primary.commit(result.items, `${result.message}${note}`);
}

function rowsFromToolSets(sets) {
  return (Array.isArray(sets) ? sets : [])
    .map((set) => [Number(set?.weight) || 0, Number(set?.reps) || 0, set?.rpe ? Number(set.rpe) : ""])
    .filter((row) => row[1] > 0);
}

function commitPlanEdit(message) {
  renderSelectedExercises();
  persistAiPlan();
  saveWorkoutDraft();
  if (workoutIsLive()) showToast("Тренер поменял текущую тренировку");
  return `${message} Сейчас: ${planOrderText()}.`;
}

function liveStatusForAi() {
  const now = new Date();
  const clock = `Сейчас ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}.`;
  if (!workoutIsLive()) return [clock, "Тренировка не идёт.", nowPlayingForAi()].join("\n");
  const sets = selected.flatMap((item) => item.sets);
  const current = focusExercise();
  const nextSet = current?.sets.find((set) => !set.done && set.mark !== "skip");
  const restLeft = restSecondsLeft();
  const bpm = freshLiveHr();
  return [
    clock,
    `Тренировка идёт ${formatDuration(getWorkoutDurationMs())}, сделано ${sets.filter((set) => set.done).length} из ${sets.length} подходов.`,
    current
      ? `Текущее упражнение: ${findExercise(current.exerciseId)?.name || current.exerciseId}${nextSet ? `, следующий подход ${formatNumber(nextSet.weight)}×${nextSet.reps}` : ", все подходы закрыты"}.`
      : "Все упражнения закрыты.",
    restLeft > 0 ? `Отдых: осталось ${restLeft} с.` : "Отдых сейчас не идёт.",
    bpm ? `Пульс: ${bpm} уд/мин.` : "Свежего пульса с браслета нет.",
    nowPlayingForAi(),
  ].join("\n");
}

function executeAiTool(name, args) {
  if (name === "get_live_status") return liveStatusForAi();
  if (name === "control_music") return aiMusicControl(args);

  if (name === "get_recent_workouts") {
    const requestedDays = Number(args.days);
    if (Number.isFinite(requestedDays) && requestedDays > 0) {
      const days = Math.min(Math.max(Math.round(requestedDays), 1), 365);
      const latestDate = state.workouts.at(-1)?.date || formatInputDate(new Date());
      const cutoff = new Date(`${latestDate}T00:00:00`);
      cutoff.setDate(cutoff.getDate() - days + 1);
      const cutoffDate = formatInputDate(cutoff);
      const period = state.workouts.filter((workout) => workout.date >= cutoffDate && workout.date <= latestDate);
      if (!period.length) return `За последние ${days} дней сохранённых тренировок нет.`;
      return buildPeriodHistoryForAi(period, days);
    }

    const count = Math.min(Math.max(Number(args.count) || 3, 1), 12);
    const recent = state.workouts.slice(-count).map(describeWorkoutForAi);
    return recent.length ? recent.join("\n\n") : "Сохранённых тренировок нет.";
  }

  if (name === "get_planned_workout") {
    const plan = selected.map((item, index) => {
      const exercise = findExercise(item.exerciseId);
      const sets = item.sets
        .map((set) => `${formatNumber(set.weight)}x${set.reps}${set.rpe ? `@${set.rpe}` : ""}${set.done ? " ✓" : ""}`)
        .join(", ");
      return `${index + 1}. ${exercise ? exercise.name : item.exerciseId} (${item.exerciseId}): ${sets}`;
    });
    const isActive = elements.workoutPanel.classList.contains("is-active");
    const upcoming = [];
    const start = new Date();
    for (let i = 0; i < 30 && upcoming.length < 5; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const iso = formatInputDate(date);
      if (isPlannedDate(iso)) upcoming.push(iso);
    }
    return [
      `Статус: ${isActive ? "тренировка идёт прямо сейчас (✓ = подход уже сделан)" : "тренировка ещё не начата"}`,
      `Дата: ${elements.dateInput.value || "не выбрана"}`,
      `Календарь пользователя (ближайшие запланированные дни): ${upcoming.length ? upcoming.join(", ") : "пусто — дни не отмечены"}`,
      `Заметка: ${elements.notesInput.value || "нет"}`,
      `Mi Band: ${formatWearableLine(wearableApi()?.loadSnapshot?.()) || "нет свежих данных"}`,
      "Упражнения:",
      plan.join("\n") || "план пуст",
      ...(pendingAiPlan && !isActive
        ? [
            "",
            selected.length
              ? "Ещё есть предложенный план (ждёт кнопки «Принять план»). Точечные правки применяются к плану выше и дублируются сюда:"
              : "Предложенный план (ждёт кнопки «Принять план»; точечные правки применяются к нему):",
            ...pendingPlanLines(pendingAiPlan).map((line, index) =>
              line.replace(/^\d+\. /, `${index + 1}. `).replace(/:/, ` (${pendingAiPlan.exercises[index].exerciseId}):`)
            ),
          ]
        : []),
    ].join("\n");
  }

  if (name === "add_new_exercise") {
    const title = (args.name || "").trim();
    if (!title) return "Ошибка: не указано название упражнения.";

    const existing = exercises.find((exercise) => exercise.name.toLowerCase() === title.toLowerCase());
    if (existing) {
      return `Такое упражнение уже есть в каталоге: ${existing.id} — ${existing.name} (${existing.group}). Используй его.`;
    }

    const exercise = addCustomExercise({ name: title, group: args.group, unit: args.unit, step: args.step });
    return `Добавил в каталог: ${exercise.id} — ${exercise.name} (${exercise.group}, ${exercise.unit}). Теперь можно ставить его в план.`;
  }

  if (["add_exercise_to_plan", "update_exercise_in_plan", "remove_exercise_from_plan", "reorder_plan"].includes(name)) {
    return applyAiPlanEdit(name, args);
  }

  if (name === "get_exercise_catalog") {
    const available = exercises.filter((exercise) => isExerciseAvailable(exercise));
    const hiddenCount = exercises.length - available.length;
    const lines = available.map((exercise) => `${exercise.id} — ${exercise.name} (${exercise.group}, ${exercise.unit})`);
    if (hiddenCount > 0) {
      lines.push(
        `\nЕщё ${hiddenCount} упражнений скрыто настройкой «Мой зал» — этого оборудования в зале пользователя нет, НЕ предлагай их. Если нужно что-то новое, добавь через add_new_exercise.`
      );
    }
    return lines.join("\n");
  }

  if (name === "set_planned_workout") {
    const items = Array.isArray(args.exercises) ? args.exercises : [];
    if (!items.length) return "Ошибка: список упражнений пуст, план не изменён.";

    const unknown = items.filter((item) => !findExercise(item.exerciseId)).map((item) => item.exerciseId);
    if (unknown.length) {
      return `Ошибка: неизвестные exerciseId: ${unknown.join(", ")}. Возьми точные id из get_exercise_catalog и повтори вызов.`;
    }

    // План не применяется сам: пользователь подтверждает его кнопкой в чате.
    storePendingAiPlan({
      version: 1,
      createdAt: Date.now(),
      notes: typeof args.notes === "string" ? args.notes.trim() : "",
      exercises: items.map((item) => ({
        exerciseId: item.exerciseId,
        sets: (item.sets || []).map((set) => ({
          weight: Number(set.weight) || 0,
          reps: Number(set.reps) || 0,
          rpe: set.rpe ? Number(set.rpe) : "",
        })),
      })),
    });
    renderAiChat();

    const summary = pendingAiPlan.exercises
      .map((item) => `${findExercise(item.exerciseId).name}: ${item.sets.length} подх.`)
      .join("; ");
    return `План показан пользователю на подтверждение (${pendingAiPlan.exercises.length} упражнений): ${summary}. В приложении он ПОКА НЕ применён — не пиши, что план сохранён. Скажи, что ждёшь кнопку «Принять план».`;
  }

  return `Ошибка: неизвестный инструмент ${name}.`;
}

function proposedOrCurrentPlanText() {
  return describePendingPlanForChat() || describePlannedWorkoutForChat();
}

function describePlannedWorkoutForChat() {
  if (!selected.length) return "";
  const rows = selected.map((item, index) => {
    const exercise = findExercise(item.exerciseId);
    const sets = item.sets
      .map((set) => `${formatNumber(set.weight)}×${set.reps}${set.rpe ? ` @ RPE ${set.rpe}` : ""}`)
      .join(", ");
    return `${index + 1}. ${exercise?.name || item.exerciseId}: ${sets}`;
  });
  return [
    `План на ${formatDate(elements.dateInput.value)} сохранён на главной:`,
    ...rows,
    elements.notesInput.value ? `Фокус: ${elements.notesInput.value}` : "",
  ].filter(Boolean).join("\n");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Кнопка «Стоп» и предохранители от бесконечного «думанья».
let aiRunController = null;
let aiRunCancelled = false;
let aiRunDeadline = 0;

const AI_CANCELLED = "остановлено";

function stopAiRun() {
  if (!aiRunController) return;
  aiRunCancelled = true;
  aiRunController.abort();
  setAiStatus("Остановил. Можешь переформулировать и отправить снова.");
  showToast("Тренер остановлен");
}

function assertAiRunAlive() {
  if (aiRunCancelled) throw new Error(AI_CANCELLED);
  if (aiRunDeadline && Date.now() > aiRunDeadline) {
    throw new Error("тренер думает слишком долго — попробуй запрос попроще");
  }
}

// Сигнал одного запроса: рвётся и по кнопке «Стоп», и по своему таймауту.
function aiRequestSignal() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  const runSignal = aiRunController?.signal;
  const onRunAbort = () => controller.abort();
  if (runSignal) {
    if (runSignal.aborted) controller.abort();
    else runSignal.addEventListener("abort", onRunAbort, { once: true });
  }
  return {
    signal: controller.signal,
    release() {
      clearTimeout(timer);
      runSignal?.removeEventListener("abort", onRunAbort);
    },
  };
}

// Supabase-функция не умеет обрываться по сигналу, поэтому просто перестаём её ждать.
function withAiTimeout(promise) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("AI-сервер не ответил, попробуй ещё раз")),
      AI_REQUEST_TIMEOUT_MS
    );
    const runSignal = aiRunController?.signal;
    const onAbort = () => reject(new Error(AI_CANCELLED));
    if (runSignal?.aborted) onAbort();
    else runSignal?.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      runSignal?.removeEventListener("abort", onAbort);
    });
  });
}

async function callOpenAiDirect(key, messages, tools, toolChoice) {
  const maxAttempts = 3;
  const payload = {
    model: AI_MODEL,
    temperature: 0.4,
    max_completion_tokens: 900,
    reasoning_effort: "none",
    messages: [
      { role: "system", content: `${AI_SYSTEM_PROMPT}\n\nСегодня ${formatInputDate(new Date())}.` },
      ...messages,
    ],
    tools,
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const request = aiRequestSignal();
    try {
      let response;
      try {
        response = await fetch(`${getAiBaseUrl()}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(payload),
          signal: request.signal,
        });
      } catch {
        // Отмену и таймаут не ретраим: иначе «Стоп» ничего не останавливает.
        assertAiRunAlive();
        if (request.signal.aborted) throw new Error("ответ не пришёл за 75 секунд");
        if (attempt < maxAttempts) {
          setAiStatus(`Связь прервалась, пробую ещё раз (${attempt + 1}/${maxAttempts})…`);
          await sleep(1200 * attempt);
          assertAiRunAlive();
          continue;
        }
        const usingDefault = getAiBaseUrl() === AI_DEFAULT_BASE_URL;
        throw new Error(
          usingDefault
            ? "нет доступа к OpenAI. Из России нужен VPN или прокси-URL в Кабинете"
            : "нет связи с AI-сервером. Проверь интернет и адрес прокси в Кабинете"
        );
      }

      if (response.status === 401) throw new Error("неверный API key");
      if (response.status === 403) {
        throw new Error("доступ запрещён (403): включи VPN или укажи прокси-URL в Кабинете");
      }
      if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
        setAiStatus(`OpenAI занят, пробую ещё раз (${attempt + 1}/${maxAttempts})…`);
        await sleep(1500 * attempt);
        assertAiRunAlive();
        continue;
      }
      if (!response.ok) throw new Error(`API вернул ${response.status}`);
      return await response.json();
    } finally {
      request.release();
    }
  }

  throw new Error("OpenAI не отвечает, попробуй чуть позже");
}

function withLiveWorkoutContext(messages) {
  if (!workoutIsLive()) return messages;
  const lastUser = messages.map((message) => message.role).lastIndexOf("user");
  if (lastUser < 0) return messages;
  const note = [
    "",
    "[Приложение: тренировка идёт прямо сейчас.",
    `Текущий список: ${planOrderText()}.`,
    "Просьбу добавить, заменить, убрать или переставить упражнение выполняй сразу точечным инструментом:",
    "add_exercise_to_plan, update_exercise_in_plan, remove_exercise_from_plan, reorder_plan. set_planned_workout сейчас недоступен.",
    "Просьбы про музыку (переключи, громче, включи что-то) выполняй через control_music, не переспрашивая.",
    "Отвечай особенно коротко: человек между подходами.",
    "Статус на момент сообщения:",
    `${liveStatusForAi()}]`,
  ].join("\n");
  return messages.map((message, index) =>
    index === lastUser ? { ...message, content: `${message.content || ""}\n${note}` } : message
  );
}

async function callOpenAi(rawMessages, toolChoice, deferredTool = "") {
  const live = workoutIsLive();
  const messages = withLiveWorkoutContext(rawMessages);
  const tools = toolChoice
    ? AI_TOOL_DEFS.filter((tool) => tool.function.name === toolChoice.function.name)
    : AI_TOOL_DEFS.filter((tool) =>
      tool.function.name !== deferredTool && !(live && tool.function.name === "set_planned_workout")
    );
  const key = getAiApiKey();
  if (key) return callOpenAiDirect(key, messages, tools, toolChoice);

  if (window.cloudSync?.callAi) {
    try {
      return await withAiTimeout(window.cloudSync.callAi(messages, tools, toolChoice));
    } catch (error) {
      assertAiRunAlive();
      if (error?.message === AI_CANCELLED) throw error;
      if (error?.status === 429) throw new Error("AI временно перегружен, попробуй ещё раз чуть позже");
      if (/не ответил/.test(error?.message || "")) throw error;
    }
  }

  throw new Error("Сначала сохрани OpenAI API key в Кабинете. Вход не нужен.");
}

async function runAiConversation({ requiredTool = "", onIntermediateText } = {}) {
  const messages = [
    ...aiChat.slice(-AI_CHAT_HISTORY_LIMIT).map((message) => ({ role: message.role, content: message.content })),
  ];
  const requiredReads = ["get_recent_workouts", "get_planned_workout", "get_exercise_catalog"];
  const completedReads = new Set();
  let requiredToolApplied = false;
  let requiredToolResult = "";
  let pendingText = "";
  let intermediateTextShown = false;

  for (let round = 0; round < AI_MAX_TOOL_ROUNDS; round++) {
    assertAiRunAlive();
    const canForceRequiredTool =
      requiredTool &&
      !requiredToolApplied &&
      pendingText &&
      requiredReads.every((name) => completedReads.has(name));
    const toolChoice = canForceRequiredTool
      ? { type: "function", function: { name: requiredTool } }
      : undefined;
    // В автоматическом сценарии write-tool скрыт, пока AI не прочитал данные
    // и не сформулировал фидбэк. После этого остаётся только обязательная запись плана.
    const data = await callOpenAi(messages, toolChoice, requiredTool);
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error("пустой ответ модели");

    if (message.tool_calls?.length) {
      messages.push(message);
      for (const call of message.tool_calls) {
        let result;
        try {
          result = await executeAiTool(call.function.name, JSON.parse(call.function.arguments || "{}"));
        } catch (error) {
          result = `Ошибка инструмента: ${error.message}`;
        }
        if (requiredReads.includes(call.function.name)) completedReads.add(call.function.name);
        if (
          call.function.name === requiredTool &&
          !String(result).startsWith("Ошибка:")
        ) {
          requiredToolApplied = true;
          requiredToolResult = result;
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
      if (requiredToolApplied && pendingText) {
        const planText = proposedOrCurrentPlanText();
        return intermediateTextShown ? planText : `${pendingText}\n\n${planText}`;
      }
      continue;
    }

    const text = (message.content || "").trim();
    if (text && requiredTool && !requiredToolApplied) {
      messages.push(message);
      const missingReads = requiredReads.filter((name) => !completedReads.has(name));
      if (!missingReads.length) {
        pendingText = text;
        if (typeof onIntermediateText === "function") {
          onIntermediateText(text);
          intermediateTextShown = true;
        }
      }
      messages.push({
        role: "user",
        content: missingReads.length
          ? `Продолжи выполнение запроса: сначала вызови ${missingReads.join(", ")}, затем обязательно ${requiredTool}. Не завершай ответ одним текстом.`
          : `Продолжи выполнение запроса и обязательно вызови ${requiredTool}. План должен быть сохранён в приложении, текста недостаточно.`,
      });
      continue;
    }
    if (text) {
      return requiredToolApplied
        ? `${text}\n\n${proposedOrCurrentPlanText()}`
        : text;
    }
    throw new Error("пустой ответ модели");
  }

  if (requiredToolApplied) {
    const planText = proposedOrCurrentPlanText() || requiredToolResult;
    return intermediateTextShown ? planText : [pendingText, planText].filter(Boolean).join("\n\n");
  }
  throw new Error("слишком много шагов, сформулируй запрос проще");
}

async function sendAiChatMessage() {
  const text = elements.aiChatInput.value.trim();
  if (!text) return;
  if (aiThinking) {
    setAiStatus("Тренер ещё отвечает. Нажми «Стоп», если нужно прервать.");
    return;
  }

  aiChat.push({ role: "user", content: text });
  persistAiChat();
  renderAiChat();
  elements.aiChatInput.value = "";
  await runAiChatCycle();
}

async function retryAiChat() {
  if (!aiChat.length || aiChat.at(-1).role !== "user") return;
  await runAiChatCycle();
}

function createFallbackNextWorkoutPlan() {
  const result = buildWorkoutFromGoal("fullbody", 45);
  if (!result?.plan?.length) return "";

  storePendingAiPlan({
    version: 1,
    createdAt: Date.now(),
    notes: "Резервный план: фулбади ~45 мин, RPE 6–8, без отказа. Вес и ротация подобраны по истории.",
    exercises: result.plan.map((item) => ({
      exerciseId: item.exerciseId,
      sets: item.sets.map((set) => ({ weight: set.weight, reps: set.reps, rpe: set.rpe ?? "" })),
    })),
  });
  renderAiChat();
  return [
    `AI не смог записать план инструментом, поэтому приложение собрало резервный вариант по твоей истории, нагрузке и упражнениям «Моего зала». Посмотри и нажми «Принять план», если подходит.`,
    describePendingPlanForChat(),
  ].join("\n\n");
}

// После завершения тренировки остаёмся в AI-чате: там видны фидбэк и описание
// сохранённого плана, а сам план уже доступен на главной.
async function autoAiAfterWorkout() {
  window.showAppView?.("ai");
  aiChat.push({
    role: "user",
    content: "Я только что закончил тренировку. Проанализируй выполненные и пропущенные подходы, веса, повторы, RPE, отметки, готовность, итоговое самочувствие, мои заметки, недавнюю нагрузку и прогресс. Дай короткий фидбэк. Затем с учётом восстановления, календаря и доступных упражнений «Моего зала» собери и сохрани следующую тренировку, после чего кратко опиши её.",
  });
  persistAiChat();
  renderAiChat();
  await runAiChatCycle({
    requiredTool: "set_planned_workout",
    onIntermediateText: (feedback) => {
      aiChat.push({ role: "assistant", content: feedback });
      persistAiChat();
      renderAiChat();
    },
  });

  // Если разбор остановили вручную, не подсовываем резервный план.
  if (aiRunCancelled) return;

  if (!pendingAiPlan && !selected.length) {
    const fallbackMessage = createFallbackNextWorkoutPlan();
    if (fallbackMessage) {
      aiChat.push({ role: "assistant", content: fallbackMessage });
      persistAiChat();
      renderAiChat();
    }
  }

  if (pendingAiPlan) {
    setAiStatus("Посмотри план и нажми «Принять», если подходит.");
    showToast("Новый план ждёт подтверждения");
  }
}

let aiPlanningRecoveryRunning = false;

function pendingWorkoutForAiPlanning() {
  if (pendingAiPlan || selected.length || !state.workouts.length) return null;

  try {
    const pending = JSON.parse(localStorage.getItem(AI_POST_WORKOUT_PENDING_KEY));
    if (pending?.workoutId || pending?.workoutDate) {
      return state.workouts.find((workout) =>
        workout.id === pending.workoutId || workout.date === pending.workoutDate
      ) || state.workouts.at(-1);
    }
  } catch {
    localStorage.removeItem(AI_POST_WORKOUT_PENDING_KEY);
  }

  // Восстанавливаем один раз сценарий, оборванный в v120 и более ранних версиях:
  // в чате уже есть автозапрос после тренировки, но сохранённого плана ещё нет.
  let autoRequestIndex = -1;
  for (let index = aiChat.length - 1; index >= 0; index -= 1) {
    const message = aiChat[index];
    if (message.role === "user" && /только что закончил тренировку/i.test(message.content)) {
      autoRequestIndex = index;
      break;
    }
  }
  if (autoRequestIndex < 0) return null;
  // Сценарий закрыт, если план уже сохранён (старые версии) или по нему принято решение.
  const planWasHandled = aiChat.slice(autoRequestIndex + 1).some((message) =>
    message.role === "assistant" &&
    /план на .+ сохран[её]н на главной|план принят|план отклон[её]н/i.test(message.content)
  );
  if (planWasHandled) return null;

  const latest = state.workouts.at(-1);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 2);
  return latest.date >= formatInputDate(cutoff) ? latest : null;
}

async function resumeAiPlanningIfNeeded() {
  if (
    aiPlanningRecoveryRunning ||
    !pendingWorkoutForAiPlanning()
  ) {
    return;
  }

  aiPlanningRecoveryRunning = true;
  try {
    await autoAiAfterWorkout();
  } finally {
    aiPlanningRecoveryRunning = false;
  }
}

async function runAiChatCycle(options = {}) {
  if (aiThinking) return false;

  // Пока тренер думает, «Отправить» уступает место «Стоп».
  elements.aiChatSendButton.disabled = true;
  if (elements.aiChatStopButton) {
    elements.aiChatSendButton.hidden = true;
    elements.aiChatStopButton.hidden = false;
  }
  aiThinking = true;
  aiError = "";
  aiRunCancelled = false;
  aiRunController = new AbortController();
  aiRunDeadline = Date.now() + AI_RUN_TIMEOUT_MS;
  renderAiChat();
  setAiStatus("Тренер смотрит твои данные… можно остановить кнопкой «Стоп».");

  try {
    const reply = await runAiConversation(options);
    aiChat.push({ role: "assistant", content: reply });
    persistAiChat();
    setAiStatus("");
    return true;
  } catch (error) {
    if (aiRunCancelled) return false;
    aiError = error.message || "нет связи с сервером";
    setAiStatus("");
    return false;
  } finally {
    aiThinking = false;
    aiRunController = null;
    aiRunDeadline = 0;
    elements.aiChatSendButton.disabled = false;
    elements.aiChatSendButton.hidden = false;
    if (elements.aiChatStopButton) elements.aiChatStopButton.hidden = true;
    renderAiChat();
  }
}
