function wearableApi() {
  return window.TrainyWearable;
}

function formatWearableLine(snapshot) {
  return wearableApi()?.hintFromSnapshot?.(snapshot) || "";
}

function renderWearableCabinet(snapshot, statusText) {
  if (elements.wearableStatus && statusText) {
    elements.wearableStatus.textContent = statusText;
  }
  if (elements.bandPageMeta) {
    elements.bandPageMeta.textContent = snapshot ? sourceWhen(snapshot) : "Сон, пульс, шаги и калории";
  }
  if (elements.wearableStats) {
    const rings = bandRingsHtml(snapshot);
    elements.wearableStats.hidden = !rings;
    elements.wearableStats.innerHTML = rings;
  }
  renderBandReadiness(snapshot);
  renderBandSleep(snapshot);
  renderBandHeart(snapshot);
  renderBandLastSession();
  renderBandAnalytics();
}

const BAND_GOALS = { sleepMinutes: 480, activeKcal: 500, steps: 8000 };
const ZONE_COLORS = {
  warmup: "#5b8def",
  fat: "#34c77b",
  aerobic: "#f2c230",
  anaerobic: "#ff8a3d",
  peak: "#ff4d5e",
};

function ringSvg(ratio, color) {
  const radius = 26;
  const length = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(1, ratio || 0)) * length;
  return `
    <svg class="band-ring-svg" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="${radius}" class="band-ring-track" />
      <circle cx="32" cy="32" r="${radius}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"
        stroke-dasharray="${filled.toFixed(1)} ${length.toFixed(1)}" transform="rotate(-90 32 32)" />
    </svg>
  `;
}

function bandRingsHtml(snapshot) {
  if (!snapshot) return "";
  const fmt = wearableApi()?.formatMinutes || ((value) => `${value} мин`);
  const steps = snapshot.todaySteps != null ? Number(snapshot.todaySteps) : null;
  const rings = [
    {
      label: "Сон",
      value: snapshot.sleepMinutes ? fmt(snapshot.sleepMinutes) : "—",
      sub: `цель ${BAND_GOALS.sleepMinutes / 60} ч`,
      ratio: (snapshot.sleepMinutes || 0) / BAND_GOALS.sleepMinutes,
      color: "#8f7cff",
    },
    {
      label: "Активность",
      value: snapshot.todayCalories ? `${snapshot.todayCalories}` : "—",
      sub: snapshot.todayTotalCalories ? `ккал · всего ${snapshot.todayTotalCalories}` : "ккал",
      ratio: (snapshot.todayCalories || 0) / BAND_GOALS.activeKcal,
      color: "#ff7a45",
    },
    {
      label: "Шаги",
      value: steps != null ? steps.toLocaleString("ru-RU") : "—",
      sub: snapshot.todayDistanceKm ? `${snapshot.todayDistanceKm} км` : `цель ${BAND_GOALS.steps.toLocaleString("ru-RU")}`,
      ratio: (steps || 0) / BAND_GOALS.steps,
      color: "#34c77b",
    },
  ];
  return rings.map((ring) => `
    <div class="band-ring">
      ${ringSvg(ring.ratio, ring.color)}
      <strong>${escapeHtml(ring.value)}</strong>
      <span>${ring.label}</span>
      <small>${escapeHtml(ring.sub)}</small>
    </div>
  `).join("");
}

function renderBandReadiness(snapshot) {
  const box = elements.bandReadiness;
  if (!box) return;
  const readiness = wearableApi()?.readinessFromSnapshot?.(snapshot);
  if (!readiness) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const text = {
    good: ["Готов к обычной тренировке", "Сон в норме — можно работать по плану."],
    okay: ["Без героизма", "Сон короче нормы: рабочие веса, но без попыток рекорда."],
    bad: ["Лучше лёгкая сессия", "Мало сна или высокий пульс покоя — снизь объём."],
  }[readiness];
  box.hidden = false;
  box.dataset.tone = readiness;
  box.innerHTML = `<i></i><div><strong>${text[0]}</strong><span>${text[1]}</span></div>`;
}

function renderBandSleep(snapshot) {
  const box = elements.bandSleepCard;
  if (!box) return;
  if (!snapshot?.sleepMinutes) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const fmt = wearableApi().formatMinutes;
  const stages = [
    ["Глубокий", snapshot.sleepDeepMinutes, "#5a48d6"],
    ["Лёгкий", snapshot.sleepLightMinutes, "#8f7cff"],
    ["REM", snapshot.sleepRemMinutes, "#c9a7ff"],
  ].filter(([, minutes]) => minutes > 0);
  const stageTotal = stages.reduce((sum, [, minutes]) => sum + minutes, 0) || 1;
  const clock = (value) => {
    const time = new Date(value);
    return Number.isNaN(time.getTime()) ? "" : time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  };
  const sleepWindow = snapshot.sleepStart && snapshot.sleepEnd ? `${clock(snapshot.sleepStart)} – ${clock(snapshot.sleepEnd)}` : "";
  box.hidden = false;
  box.innerHTML = `
    <div class="band-card-head"><h3>Сон</h3><small>${escapeHtml(sleepWindow)}</small></div>
    <div class="band-big">${escapeHtml(fmt(snapshot.sleepMinutes))}</div>
    ${stages.length ? `
      <div class="band-stack">${stages.map(([label, minutes, color]) =>
        `<span style="flex:${minutes};background:${color}" title="${label}"></span>`).join("")}</div>
      <div class="band-legend">${stages.map(([label, minutes, color]) => `
        <div><i style="background:${color}"></i><span>${label}</span><b>${escapeHtml(fmt(minutes))}</b><small>${Math.round((minutes / stageTotal) * 100)}%</small></div>
      `).join("")}</div>
    ` : ""}
  `;
}

// Отдельно различаем «нет доступа» и «доступ есть, но Mi Fitness не пишет пульс»:
// иначе оба случая выглядят как пустой экран.
function heartAccessState(snapshot) {
  if (!snapshot) return "unknown";
  if (snapshot.permissions && snapshot.permissions.heartRate === false) return "denied";
  if (snapshot.hrCount24h === 0 && !snapshot.lastHr && !snapshot.restingHr) return "empty";
  if (snapshot.lastHr || snapshot.restingHr || snapshot.hrCount24h) return "ok";
  return "unknown";
}

function renderBandHeart(snapshot) {
  const box = elements.bandHeartCard;
  if (!box) return;
  const access = heartAccessState(snapshot);
  if (access === "unknown") {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  if (access === "denied") {
    box.dataset.tone = "warn";
    box.innerHTML = `
      <div class="band-card-head"><h3>Пульс</h3><small>нет доступа</small></div>
      <p class="wearable-help">Приложению не выдано чтение пульса в Health Connect, поэтому пульса нет ни здесь, ни в тренировках.</p>
      <div class="cabinet-actions">
        <button class="button secondary" type="button" data-band-action="grant">Выдать доступ</button>
        <button class="button ghost" type="button" data-band-action="settings">Открыть Health Connect</button>
      </div>
    `;
    return;
  }
  if (access === "empty") {
    box.dataset.tone = "warn";
    box.innerHTML = `
      <div class="band-card-head"><h3>Пульс</h3><small>0 замеров за сутки</small></div>
      <p class="wearable-help">Доступ есть, но Mi Fitness не передал в Health Connect ни одного замера пульса. В Mi Fitness: профиль → Сторонние данные → Health Connect → проверь, что «Пульс» включён, затем открой Mi Fitness и дождись синхронизации.</p>
      <div class="cabinet-actions">
        <button class="button ghost" type="button" data-band-action="settings">Открыть Health Connect</button>
      </div>
    `;
    return;
  }

  delete box.dataset.tone;
  const lastAt = snapshot.lastHrAt ? new Date(snapshot.lastHrAt) : null;
  const lastLabel = lastAt && !Number.isNaN(lastAt.getTime())
    ? lastAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : "";
  const tiles = [
    snapshot.restingHr ? ["Покоя", snapshot.restingHr] : null,
    snapshot.hrDayMin ? ["Мин", snapshot.hrDayMin] : null,
    snapshot.hrDayAvg ? ["Средний", snapshot.hrDayAvg] : null,
    snapshot.hrDayMax ? ["Макс", snapshot.hrDayMax] : null,
  ].filter(Boolean);
  box.innerHTML = `
    <div class="band-card-head"><h3>Пульс</h3><small>${snapshot.hrCount24h ? `${snapshot.hrCount24h} замеров за сутки` : ""}</small></div>
    <div class="band-big">${snapshot.lastHr || snapshot.restingHr}<small> уд/мин${lastLabel ? ` · ${lastLabel}` : ""}</small></div>
    ${dayHeartSvg(snapshot.hrDaySeries)}
    ${tiles.length ? `<div class="band-tiles">${tiles.map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join("")}</div>` : ""}
  `;
}

function dayHeartSvg(series) {
  const points = (series || [])
    .map((point) => ({ t: Date.parse(point.t), bpm: Number(point.bpm) || 0 }))
    .filter((point) => point.bpm > 30 && Number.isFinite(point.t));
  if (points.length < 2) return "";
  const width = 320;
  const height = 70;
  const start = points[0].t;
  const span = Math.max(1, points.at(-1).t - start);
  const lo = Math.min(...points.map((point) => point.bpm)) - 4;
  const hi = Math.max(...points.map((point) => point.bpm)) + 4;
  const x = (t) => ((t - start) / span) * width;
  const y = (bpm) => height - ((bpm - lo) / Math.max(1, hi - lo)) * height;
  const line = points.map((point, index) => `${index ? "L" : "M"}${x(point.t).toFixed(1)},${y(point.bpm).toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const clock = (t) => new Date(t).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `
    <svg class="band-day-hr" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Пульс за сутки">
      <path d="${area}" fill="rgba(255,77,94,0.16)" />
      <path d="${line}" fill="none" stroke="#ff4d5e" stroke-width="2" stroke-linejoin="round" />
    </svg>
    <div class="band-axis"><span>${clock(start)}</span><span>${clock(points.at(-1).t)}</span></div>
  `;
}

function renderBandLastSession() {
  const box = elements.bandLastSession;
  if (!box) return;
  const last = state.workouts.at(-1);
  if (!last) {
    box.innerHTML = "";
    return;
  }

  const band = last.wearable || {};
  const index = state.workouts.indexOf(last);
  const title = `<div class="band-card-head"><h3>Последняя тренировка</h3><small>${escapeHtml(sessionWhen(last))}</small></div>`;
  const resync = (primary) =>
    `<button class="button ${primary ? "secondary" : "ghost"}" type="button" data-band-resync="${index}">Подтянуть с браслета</button>`;

  if (!band.hrAvg && !band.calories) {
    box.innerHTML = `
      <div class="band-card">
        ${title}
        <p class="wearable-help">${escapeHtml(missingSessionText())}</p>
        ${resync(true)}
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="band-card">
      ${title}
      ${bandSessionSummaryHtml(last)}
      ${band.hrAvg ? hrTimelineHtml(last) : `<p class="wearable-help">${escapeHtml(missingSessionText())}</p>`}
      ${zoneListHtml(band)}
      ${restRecoveryHtml(last)}
      ${resync(!band.hrAvg)}
    </div>
  `;
  bindHrTimeline(box);
}

function sessionWhen(workout) {
  const started = workout.startedAt ? new Date(workout.startedAt) : null;
  const time = started && !Number.isNaN(started.getTime())
    ? started.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : "";
  return [formatDate(workout.date), time].filter(Boolean).join(", ");
}

function missingSessionText() {
  const access = heartAccessState(wearableApi()?.loadSnapshot?.());
  if (access === "denied") return "Пульса нет: приложению не выдано чтение пульса. Выдай доступ в карточке «Пульс» выше.";
  if (access === "empty") return "Пульса нет: Mi Fitness не передаёт замеры пульса в Health Connect. Включи «Пульс» в Mi Fitness → Сторонние данные → Health Connect.";
  return "Пульса за эту тренировку в Health Connect пока нет. Mi Fitness выгружает тренировку с задержкой — открой её в Mi, дождись синхронизации и нажми «Подтянуть с браслета».";
}

function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}

function bandSessionSummaryHtml(workout) {
  const band = workout.wearable || {};
  const minutes = workout.durationMinutes
    || (workout.startedAt && workout.endedAt ? Math.round((Date.parse(workout.endedAt) - Date.parse(workout.startedAt)) / 60000) : null);
  const stats = [
    minutes ? ["Время", formatClock(minutes * 60)] : null,
    band.hrAvg ? ["Средний", `${band.hrAvg}`] : null,
    band.hrMax ? ["Макс", `${band.hrMax}`] : null,
    band.sessionTypeLabel ? ["Зона", band.sessionTypeLabel] : null,
  ].filter(Boolean);
  const note = band.caloriesSource === "estimate"
    ? "оценка по пульсу и весу"
    : band.calories ? "с браслета" : "";
  return `
    <div class="band-big">${band.calories || "—"}<small> ккал${note ? ` · ${note}` : ""}</small></div>
    <div class="band-tiles">${stats.map(([label, value]) => `<div><span>${label}</span><b>${escapeHtml(value)}</b></div>`).join("")}</div>
  `;
}

function zoneListHtml(wearable) {
  const zones = wearable?.zones;
  if (!zones) return "";
  const labels = wearableApi()?.ZONE_LABELS || {};
  const order = (wearableApi()?.ZONE_ORDER || Object.keys(ZONE_COLORS)).slice().reverse();
  const total = order.reduce((sum, key) => sum + (zones[key] || 0), 0);
  if (!total) return "";
  return `
    <div class="band-zone-list">
      ${order.map((key) => {
        const seconds = zones[key] || 0;
        const share = Math.round((seconds / total) * 100);
        return `
          <div class="band-zone-row">
            <span><i style="background:${ZONE_COLORS[key]}"></i>${labels[key] || key}</span>
            <em><b style="width:${Math.max(seconds ? 3 : 0, share)}%;background:${ZONE_COLORS[key]}"></b></em>
            <small>${formatClock(seconds)}</small>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// Разбор подходов по пульсу имеет смысл, только если замеры идут чаще раза в ~20 сек:
// при редких точках пик подхода и провал отдыха просто не видны.
function heartIsDense(workout) {
  const band = workout.wearable || {};
  const points = hrSeriesPoints(workout);
  if (points.length < 8) return false;
  const spanMinutes = (points.at(-1).t - points[0].t) / 60000;
  if (spanMinutes <= 0) return false;
  const raw = Number(band.hrRawCount) || points.length;
  return raw / spanMinutes >= 3;
}

// Геометрия последнего нарисованного графика — нужна обработчикам касаний.
let hrTimelineView = null;

// Собираем таймлайн: точки пульса + блоки упражнений на той же временной шкале.
function buildHrTimeline(workout) {
  const points = hrSeriesPoints(workout).sort((a, b) => a.t - b.t);
  if (points.length < 3) return null;

  const marked = exerciseSetWindows(workout);
  let blocks = [];
  if (marked.length) {
    marked.forEach((window) => {
      const previous = blocks.at(-1);
      if (previous && previous.exerciseId === window.exerciseId) {
        previous.to = window.to;
        previous.sets += 1;
      } else {
        blocks.push({ exerciseId: window.exerciseId, from: window.from, to: window.to, sets: 1 });
      }
    });
  }

  const segments = blocks
    .filter((block) => block.to > block.from)
    .map((block, index) => {
      const inside = points.filter((point) => point.t >= block.from && point.t <= block.to);
      const values = inside.map((point) => point.bpm);
      return {
        ...block,
        index,
        name: findExercise(block.exerciseId)?.name || block.exerciseId,
        avg: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null,
        max: values.length ? Math.max(...values) : null,
      };
    });

  return {
    points,
    segments,
    start: points[0].t,
    end: points.at(-1).t,
    hrMax: workout.wearable?.hrMaxUsed || 190,
  };
}

// Интерактивный график: ведёшь пальцем — видно время, пульс, зону и упражнение.
function hrTimelineHtml(workout) {
  const timeline = buildHrTimeline(workout);
  hrTimelineView = null;
  if (!timeline) return "";

  const width = 320;
  const height = 140;
  const { points, segments, start, end } = timeline;
  const span = Math.max(1, end - start);
  const values = points.map((point) => point.bpm);
  const lo = Math.max(40, Math.floor((Math.min(...values) - 6) / 10) * 10);
  const hi = Math.ceil((Math.max(...values) + 6) / 10) * 10;
  const x = (t) => ((t - start) / span) * width;
  const y = (bpm) => height - ((bpm - lo) / Math.max(1, hi - lo)) * height;
  hrTimelineView = { ...timeline, width, height, lo, hi, span };

  const step = hi - lo > 60 ? 30 : 20;
  const grid = [];
  for (let bpm = Math.ceil(lo / step) * step; bpm < hi; bpm += step) {
    if (bpm > lo) grid.push(bpm);
  }
  const gridLines = grid.map((bpm) => `
    <line class="hr-grid" x1="0" y1="${y(bpm).toFixed(1)}" x2="${width}" y2="${y(bpm).toFixed(1)}" />
  `).join("");
  const gridLabels = grid.map((bpm) =>
    `<span style="top:${((y(bpm) / height) * 100).toFixed(1)}%">${bpm}</span>`).join("");

  const avg = workout.wearable?.hrAvg || Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  const avgLine = `<line class="hr-avg" x1="0" y1="${y(avg).toFixed(1)}" x2="${width}" y2="${y(avg).toFixed(1)}" />`;

  const api = wearableApi();
  const zoneOf = (bpm) => api?.zoneForBpm?.(bpm, timeline.hrMax) || "aerobic";
  const runs = [];
  points.forEach((point, index) => {
    const zone = zoneOf(point.bpm);
    const current = runs.at(-1);
    const coords = `${x(point.t).toFixed(1)},${y(point.bpm).toFixed(1)}`;
    if (current && current.zone === zone) {
      current.coords.push(coords);
      return;
    }
    // Новый отрезок начинаем с последней точки прошлого, чтобы линия не рвалась.
    const previous = index ? `${x(points[index - 1].t).toFixed(1)},${y(points[index - 1].bpm).toFixed(1)}` : null;
    runs.push({ zone, coords: previous ? [previous, coords] : [coords] });
  });
  const zoneLines = runs.map((run) =>
    `<polyline points="${run.coords.join(" ")}" fill="none" stroke="${ZONE_COLORS[run.zone] || "var(--accent)"}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />`
  ).join("");

  const segmentShapes = segments.map((segment) => {
    const from = Math.max(0, x(segment.from));
    const to = Math.min(width, x(segment.to));
    return `
      <rect class="hr-seg" data-hr-seg="${segment.index}" x="${from.toFixed(1)}" y="0" width="${Math.max(0.5, to - from).toFixed(1)}" height="${height}" />
      <line class="hr-seg-edge" x1="${from.toFixed(1)}" y1="0" x2="${from.toFixed(1)}" y2="${height}" />
    `;
  }).join("");

  const strip = segments.map((segment) => `
    <button type="button" class="hr-strip-block" data-hr-block="${segment.index}"
      style="flex:${Math.max(1, Math.round(segment.to - segment.from))}"
      title="${escapeHtml(segment.name)}"
      aria-label="${escapeHtml(segment.name)}">
      <b>${segment.index + 1}</b>
    </button>
  `).join("");

  const minutes = Math.max(1, Math.round(span / 60000));
  return `
    <div class="hr-chart" data-hr-chart>
      <div class="hr-chart-readout" data-hr-readout>${escapeHtml(hrTimelineSummary(workout, timeline, minutes))}</div>
      <div class="hr-chart-plot" data-hr-plot>
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Пульс за тренировку">
          ${gridLines}
          ${segmentShapes}
          ${avgLine}
          ${zoneLines}
          <line class="hr-cursor" data-hr-cursor x1="0" y1="0" x2="0" y2="${height}" />
          <circle class="hr-cursor-dot" data-hr-dot cx="0" cy="0" r="4" />
        </svg>
        <div class="hr-grid-labels" aria-hidden="true">${gridLabels}</div>
      </div>
      <div class="hr-chart-axis">
        <span>0:00</span><span>${formatClock(span / 2000)}</span><span>${formatClock(span / 1000)}</span>
      </div>
      <div class="hr-chart-legend"><span><i class="hr-legend-avg"></i>средний ${avg}</span><span>${points.length} замеров</span></div>
      ${segments.length ? `<div class="hr-strip">${strip}</div>` : ""}
    </div>
  `;
}

function hrTimelineSummary(workout, timeline, minutes) {
  const band = workout.wearable || {};
  const bits = [`${minutes} мин`];
  if (band.hrAvg) bits.push(`средний ${band.hrAvg}`);
  if (band.hrMax) bits.push(`максимум ${band.hrMax}`);
  if (timeline.segments.length) bits.push(`${timeline.segments.length} упр.`);
  return `${bits.join(" · ")} — веди пальцем по графику`;
}

function hrZoneLabel(bpm, hrMax) {
  const api = wearableApi();
  const key = api?.zoneForBpm?.(bpm, hrMax);
  return (key && api?.ZONE_LABELS?.[key]) || "";
}

// Касания по графику и блокам упражнений.
function bindHrTimeline(root) {
  const chart = root.querySelector("[data-hr-chart]");
  const view = hrTimelineView;
  if (!chart || !view) return;
  const plot = chart.querySelector("[data-hr-plot]");
  const cursor = chart.querySelector("[data-hr-cursor]");
  const dot = chart.querySelector("[data-hr-dot]");
  const readout = chart.querySelector("[data-hr-readout]");
  const idleText = readout.textContent;

  const clearSegments = () => {
    chart.querySelectorAll("[data-hr-seg]").forEach((node) => node.removeAttribute("data-active"));
    chart.querySelectorAll("[data-hr-block]").forEach((node) => node.removeAttribute("data-active"));
  };

  const highlight = (index) => {
    clearSegments();
    if (index == null) return;
    chart.querySelector(`[data-hr-seg="${index}"]`)?.setAttribute("data-active", "1");
    chart.querySelector(`[data-hr-block="${index}"]`)?.setAttribute("data-active", "1");
  };

  const scrub = (clientX) => {
    const rect = plot.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const time = view.start + ratio * view.span;
    const point = view.points.reduce((best, item) =>
      Math.abs(item.t - time) < Math.abs(best.t - time) ? item : best, view.points[0]);
    const px = ((point.t - view.start) / view.span) * view.width;
    const py = view.height - ((point.bpm - view.lo) / Math.max(1, view.hi - view.lo)) * view.height;
    cursor.setAttribute("x1", px.toFixed(1));
    cursor.setAttribute("x2", px.toFixed(1));
    dot.setAttribute("cx", px.toFixed(1));
    dot.setAttribute("cy", py.toFixed(1));
    chart.dataset.active = "1";

    const segment = view.segments.find((item) => point.t >= item.from && point.t <= item.to);
    highlight(segment ? segment.index : null);
    const elapsed = Math.max(0, Math.round((point.t - view.start) / 1000));
    const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
    const zone = hrZoneLabel(point.bpm, view.hrMax);
    const parts = [clock, `${point.bpm} уд`, zone, segment ? `${segment.index + 1}. ${segment.name}` : null];
    readout.textContent = parts.filter(Boolean).join(" · ");
  };

  const reset = () => {
    chart.dataset.active = "";
    clearSegments();
    readout.textContent = idleText;
  };

  plot.addEventListener("pointerdown", (event) => {
    plot.setPointerCapture?.(event.pointerId);
    scrub(event.clientX);
  });
  plot.addEventListener("pointermove", (event) => {
    if (event.pointerType === "mouse" && !event.buttons) return;
    scrub(event.clientX);
  });
  // После отпускания палец уже не на экране — значение под курсором оставляем,
  // чтобы его можно было спокойно прочитать.
  plot.addEventListener("pointercancel", reset);
  plot.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") reset();
  });

  chart.querySelectorAll("[data-hr-block]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.hrBlock);
      const segment = view.segments[index];
      if (!segment) return;
      if (button.dataset.active) {
        reset();
        return;
      }
      highlight(index);
      chart.dataset.active = "";
      const minutes = Math.max(1, Math.round((segment.to - segment.from) / 60000));
      const stats = segment.avg ? `пульс ${segment.avg}, макс ${segment.max}` : "пульса нет";
      const zone = segment.avg ? hrZoneLabel(segment.avg, view.hrMax) : "";
      readout.textContent = [`${index + 1}. ${segment.name}`, stats, zone, `${minutes} мин`]
        .filter(Boolean)
        .join(" · ");
    });
  });
}

// Пульс по упражнениям: окно подхода — это время от прошлой отметки до текущей.
// Отметки годятся, только если их ставили по ходу тренировки, а не пачкой в конце.
function exerciseSetWindows(workout) {
  const marks = [];
  (workout.exercises || []).forEach((item) => {
    (item.sets || []).forEach((set, setIndex) => {
      const doneAt = Number(set.doneAt) || 0;
      if (doneAt) marks.push({ exerciseId: item.exerciseId, setIndex, doneAt });
    });
  });
  marks.sort((a, b) => a.doneAt - b.doneAt);
  if (marks.length < 3) return [];

  const spread = marks.at(-1).doneAt - marks[0].doneAt;
  const gaps = marks.slice(1).map((mark, index) => mark.doneAt - marks[index].doneAt);
  const typicalGap = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  if (spread < 5 * 60 * 1000 || typicalGap < 20000) return [];

  // Первый блок начинается со старта тренировки: разминка идёт до первой галочки,
  // и обрезать её до минуты перед отметкой значит потерять пик пульса.
  const sessionStart = Date.parse(workout.startedAt || "");
  return marks.map((mark, index) => {
    const previous = marks[index - 1];
    const from = previous
      ? previous.doneAt
      : (Number.isFinite(sessionStart) && sessionStart < mark.doneAt ? sessionStart : mark.doneAt - 60000);
    return { ...mark, from, to: mark.doneAt };
  });
}

function hrSeriesPoints(workout) {
  return (workout.wearable?.hrSeries || [])
    .map((point) => ({ bpm: Number(point.bpm) || 0, t: Date.parse(point.t) }))
    .filter((point) => point.bpm > 30 && Number.isFinite(point.t));
}

// Пики пульса — это и есть подходы: их видно в сигнале, даже если галочки
// проставлены пачкой в конце или не проставлены вообще.
function heartPeaks(points) {
  if (points.length < 8) return [];
  const avg = points.reduce((sum, point) => sum + point.bpm, 0) / points.length;
  const peaks = [];
  points.forEach((point) => {
    if (point.bpm < avg + 4) return;
    const neighbours = points.filter((other) => Math.abs(other.t - point.t) <= 45000);
    if (point.bpm < Math.max(...neighbours.map((other) => other.bpm))) return;
    const after = points.filter((other) => other.t > point.t && other.t <= point.t + 90000);
    if (!after.length) return;
    const drop = point.bpm - Math.min(...after.map((other) => other.bpm));
    if (drop < 4) return;
    const previous = peaks.at(-1);
    if (previous && point.t - previous.t < 60000) {
      if (point.bpm > previous.bpm) peaks[peaks.length - 1] = { t: point.t, bpm: point.bpm, drop };
      return;
    }
    peaks.push({ t: point.t, bpm: point.bpm, drop });
  });
  return peaks;
}

// Насколько быстро пульс падает после подхода — прямая оценка качества отдыха.
function restRecoveryHtml(workout) {
  const points = hrSeriesPoints(workout);
  if (points.length < 8) return "";
  if (!heartIsDense(workout)) {
    return `<small class="band-hint">Разбор отдыха между подходами скрыт: браслет мерил пульс реже раза в 20 сек, по таким точкам пики подходов не видны. Запускай на браслете тренировку «Силовая» — тогда замеры идут каждую секунду.</small>`;
  }

  const marks = exerciseSetWindows(workout);
  let drops = [];
  let gaps = [];
  let basis = "";

  if (marks.length >= 3) {
    marks.forEach((window) => {
      const at = points.filter((point) => point.t <= window.to).at(-1);
      const after = points.filter((point) => point.t > window.to && point.t <= window.to + 90000);
      if (at && after.length) drops.push(at.bpm - Math.min(...after.map((point) => point.bpm)));
    });
    gaps = marks.slice(1).map((window, index) => (window.to - marks[index].to) / 1000);
    basis = "по отметкам подходов";
  }

  if (drops.length < 3) {
    const peaks = heartPeaks(points);
    if (peaks.length < 3) return "";
    drops = peaks.map((peak) => peak.drop);
    gaps = peaks.slice(1).map((peak, index) => (peak.t - peaks[index].t) / 1000);
    basis = `по пикам пульса, найдено ${peaks.length} рабочих подходов`;
  }

  const avgDrop = Math.round(drops.reduce((sum, value) => sum + value, 0) / drops.length);
  const restGaps = gaps.filter((seconds) => seconds > 20 && seconds < 900);
  const avgRest = restGaps.length
    ? Math.round(restGaps.reduce((sum, value) => sum + value, 0) / restGaps.length)
    : null;
  const verdict = avgDrop >= 20
    ? "Пульс падает хорошо — восстановление в норме."
    : avgDrop >= 10
      ? "Восстановление среднее: паузы можно чуть удлинить."
      : "Пульс почти не падает между подходами — отдыхай дольше или снизь вес.";

  return `
    <div class="band-recovery">
      <strong>Отдых между подходами</strong>
      <span>Падение пульса за 90 сек: ${avgDrop > 0 ? `−${avgDrop}` : "0"} уд.${avgRest ? ` · средняя пауза ${avgRest} сек` : ""}</span>
      <span>${verdict}</span>
      <small class="band-hint">Считаю ${basis}.</small>
    </div>
  `;
}

function hrSparklineSvg(series) {
  const points = (series || []).map((sample) => Number(sample.bpm) || 0).filter((bpm) => bpm > 30);
  if (points.length < 2) return "";
  const width = 280;
  const height = 72;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(8, max - min);
  const path = points.map((bpm, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - 8 - ((bpm - min) / span) * (height - 16);
    return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg class="hr-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
}

function zoneBarHtml(wearable) {
  const shares = wearable?.zoneShares;
  if (!shares) return "";
  const labels = wearableApi()?.ZONE_LABELS || {};
  const order = wearableApi()?.ZONE_ORDER || ["warmup", "fat", "aerobic", "anaerobic", "peak"];
  return `<div class="band-zones">${order.map((key) => `
    <div class="band-zone">
      <i><em style="width:${Math.max(6, shares[key] || 0)}%"></em></i>
      <span>${labels[key] || key} ${shares[key] || 0}%</span>
    </div>
  `).join("")}</div>`;
}

function wearableCardHtml(wearable) {
  if (!wearable) return "";
  const bits = [];
  if (wearable.sessionTypeLabel) bits.push(wearable.sessionTypeLabel);
  if (wearable.hrAvg) bits.push(`пульс ${wearable.hrAvg} (${wearable.hrMin}–${wearable.hrMax})`);
  if (wearable.calories) {
    bits.push(`${wearable.calories} ккал${wearable.caloriesSource === "estimate" ? " оценка" : ""}`);
  }
  if (wearable.steps != null) bits.push(`шаги ${Number(wearable.steps).toLocaleString("ru-RU")}`);
  if (!bits.length && !wearable.hrSeries?.length) return "";
  return `
    <div class="wearable-session">
      <div class="wearable-session-top">
        <strong>${escapeHtml(bits[0] || "Браслет")}</strong>
        ${bits.slice(1).map((bit) => `<span>${escapeHtml(bit)}</span>`).join("")}
      </div>
      ${hrSparklineSvg(wearable.hrSeries)}
      ${zoneBarHtml(wearable)}
    </div>
  `;
}

function renderWearableHint() {
  const button = elements.wearableApplyHint;
  if (!button) return;
  const snapshot = wearableApi()?.loadSnapshot?.();
  const hint = formatWearableLine(snapshot);
  const suggested = wearableApi()?.readinessFromSnapshot?.(snapshot);
  if (!hint || !suggested || suggested === elements.readinessInput.value) {
    button.hidden = true;
    button.textContent = "";
    return;
  }
  button.hidden = false;
  button.textContent = `С браслета: ${hint}`;
}

async function initWearable() {
  const api = wearableApi();
  if (!api) return;
  const snapshot = api.loadSnapshot();
  renderWearableCabinet(snapshot, snapshot ? `Последние данные: ${sourceWhen(snapshot)}` : "Сон, пульс, калории и шаги через Health Connect");
  renderWearableHint();
  if (!api.isNative()) {
    renderWearableCabinet(snapshot, "На телефоне открой Android-приложение: браузер до Mi Band не достучится.");
    return;
  }
  try {
    const availability = await api.availability();
    if (!availability?.available) {
      renderWearableCabinet(
        snapshot,
        availability?.reason === "update"
          ? "Обнови Health Connect, затем подключи браслет."
          : "Поставь Health Connect и включи обмен в Mi Fitness."
      );
      return;
    }
    if (snapshot) await refreshWearable(true);
    else renderWearableCabinet(snapshot, "Нажми «Подключить» на этой вкладке");
    await autoResyncRecentBand();
  } catch {
    renderWearableHint();
  }
}

function sourceWhen(snapshot) {
  if (!snapshot?.updatedAt) return snapshot?.sourceLabel || "браслет";
  const time = new Date(snapshot.updatedAt);
  if (Number.isNaN(time.getTime())) return snapshot.sourceLabel || "браслет";
  return `${snapshot.sourceLabel || "браслет"}, ${time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

async function connectWearable() {
  const api = wearableApi();
  if (!api) return;
  elements.wearableConnectButton.disabled = true;
  try {
    const snapshot = await api.connect();
    renderWearableCabinet(snapshot, `Подключено: ${sourceWhen(snapshot)}`);
    renderWearableHint();
    renderCoach();
    showToast("Mi Band подключён");
  } catch (error) {
    renderWearableCabinet(api.loadSnapshot(), error.message || "Не удалось подключить браслет");
    showToast(error.message || "Не удалось подключить браслет", "warn");
  } finally {
    elements.wearableConnectButton.disabled = false;
  }
}

async function refreshWearable(silent = false) {
  const api = wearableApi();
  if (!api?.isNative?.()) return;
  try {
    const snapshot = await api.refresh();
    renderWearableCabinet(snapshot, `Обновил: ${sourceWhen(snapshot)}`);
    renderWearableHint();
    updateNativeWidget();
    if (!silent) showToast("Данные браслета обновлены");
  } catch (error) {
    if (!silent) {
      renderWearableCabinet(api.loadSnapshot(), error.message || "Нет свежих данных с браслета");
      showToast(error.message || "Нет данных с браслета", "warn");
    }
  }
}

// Данные с браслета приезжают позже конца тренировки, поэтому сессию можно перечитать.
async function resyncWorkoutBand(index, { silent = false } = {}) {
  const workout = state.workouts[index];
  const api = wearableApi();
  if (!workout || !api?.resyncWorkout || !api.isNative?.()) {
    if (!silent) showToast("Доступно только в Android-приложении", "warn");
    return false;
  }

  if (!silent) showToast("Читаю данные с браслета…");
  let metrics = null;
  try {
    metrics = await api.resyncWorkout({
      startIso: workout.startedAt || workout.wearable?.windowStart,
      endIso: workout.endedAt || workout.wearable?.windowEnd,
      dateIso: workout.date,
    });
  } catch {
    metrics = null;
  }

  if (!metrics?.hrAvg && !metrics?.calories) {
    if (!silent) {
      showToast("Health Connect не отдал сессию: в нём нет этой тренировки. Открой её в Mi Fitness и подожди синхронизацию, потом ещё раз «Подтянуть».", "warn");
    }
    return false;
  }

  workout.wearable = { ...(workout.wearable || {}), ...metrics };
  saveState();
  window.cloudSync?.pushWorkout?.(workout);
  renderWearableCabinet(api.loadSnapshot(), "Данные сессии обновлены");
  updateNativeWidget();
  if (!silent) showToast(`Подтянул: пульс ${metrics.hrAvg || "—"}, ${metrics.calories || "—"} ккал`);
  return true;
}

// Тихо дочитываем свежую тренировку, если браслет не успел синхронизироваться к сохранению.
async function autoResyncRecentBand() {
  const api = wearableApi();
  if (!api?.isNative?.()) return;
  const index = state.workouts.length - 1;
  const workout = state.workouts[index];
  if (!workout || workout.wearable?.hrAvg) return;
  const finished = Date.parse(workout.endedAt || `${workout.date}T23:59:59`);
  if (!Number.isFinite(finished) || Date.now() - finished > 48 * 3600 * 1000) return;
  await resyncWorkoutBand(index, { silent: true });
}

async function renderBandDiagnostics() {
  const box = document.querySelector("#bandDiagnostics");
  const api = wearableApi();
  if (!box) return;
  if (!api?.diagnostics || !api.isNative?.()) {
    box.innerHTML = `<p class="wearable-help">Диагностика доступна в Android-приложении.</p>`;
    return;
  }
  box.innerHTML = `<p class="wearable-help">Читаю Health Connect…</p>`;
  const last = state.workouts.at(-1);
  const rangeStart = last?.date
    ? new Date(`${last.date}T00:00:00`).toISOString()
    : new Date(Date.now() - 72 * 3600 * 1000).toISOString();
  let report = null;
  try {
    report = await api.diagnostics(rangeStart);
  } catch {
    report = null;
  }
  if (!report?.rows?.length) {
    box.innerHTML = `<p class="wearable-help">Health Connect не вернул записи. Данные в Mi Fitness сами сюда не копируются — профиль → Сторонние данные → Health Connect, затем открой тренировку в Mi и подожди синхронизацию.</p>`;
    return;
  }
  const empty = (report.rows || []).every((row) => !row.records);
  const denied = (report.rows || []).filter((row) => row.granted === false).map((row) => row.label);
  const fromLabel = report.from ? formatDate(report.from.slice(0, 10)) : "";
  box.innerHTML = `
    ${denied.length ? `<p class="wearable-help"><b>Нет доступа:</b> ${escapeHtml(denied.join(", "))}. Нажми «Выдать доступ» выше или разреши в Health Connect → Приложения → Trainy.</p>` : ""}
    <p class="wearable-help">${empty
      ? "Health Connect пустой за эти дни, хотя в Mi Fitness тренировка может быть. Xiaomi выгружает её не сразу: открой сессию в Mi, подожди синхронизацию и нажми «Проверить ещё раз»."
      : `Health Connect отдал с ${fromLabel || "последних дней"}:`}</p>
    ${report.rows.map((row) => `
      <div class="band-diag-row">
        <span>${escapeHtml(row.label)}</span>
        <b>${formatNumber(row.sum)}</b>
        <small>${row.granted === false
          ? "нет доступа — нажми «Выдать доступ»"
          : `${row.records} записей${(row.sources || []).length ? ` · ${escapeHtml((row.sources || []).join(", "))}` : " · нет источника"}`}</small>
      </div>
    `).join("")}
  `;
}

async function openWearableSettings() {
  try {
    await wearableApi()?.openSettings?.();
  } catch (error) {
    showToast(error.message || "Открой Health Connect вручную", "warn");
  }
}

function applyWearableReadiness() {
  const snapshot = wearableApi()?.loadSnapshot?.();
  const suggested = wearableApi()?.readinessFromSnapshot?.(snapshot);
  if (!suggested) return;
  elements.readinessInput.value = suggested;
  renderCoach();
  saveWorkoutDraft();
}

async function attachWearableMetrics(workout) {
  const api = wearableApi();
  if (!api?.sessionMetrics) return null;
  try {
    if (api.isNative?.()) showToast("Снимаю пульс и калории с браслета…");
    return await api.sessionMetrics(workoutTimer.startedAt, workoutTimer.stoppedAt || Date.now());
  } catch {
    return null;
  }
}

function startLiveBandHr() {
  stopLiveBandHr();
  pollLiveBandHr();
  liveBandHrTimer = window.setInterval(pollLiveBandHr, 2000);
  renderMusicBar();
}

function stopLiveBandHr() {
  if (liveBandHrTimer) {
    window.clearInterval(liveBandHrTimer);
    liveBandHrTimer = null;
  }
  renderMusicBar();
}

async function pollLiveBandHr() {
  applyLockDones();
  const node = elements.bandLiveHr;
  const api = wearableApi();
  if (!node || !api?.liveHeartRate || !api.isNative?.()) return;
  try {
    const live = await api.liveHeartRate();
    if (!live?.bpm || !live.at) {
      if (liveBandHr && Date.now() - liveBandHr.at > 20 * 60 * 1000) {
        liveBandHr = null;
        node.hidden = true;
        node.textContent = "";
        paintSetHeart();
        updateNativeWidget();
      }
      return;
    }
    liveBandHr = { bpm: live.bpm, at: live.at };
    const stale = Date.now() - live.at > 20000;
    node.hidden = stale;
    node.textContent = stale ? "" : `${live.bpm}`;
    paintSetHeart();
    updateNativeWidget();
  } catch {
    // пульс во время сессии не обязателен
  }
}

function wearableReportLine(wearable) {
  if (!wearable) return "";
  const bits = [];
  if (wearable.sessionTypeLabel) bits.push(wearable.sessionTypeLabel);
  if (wearable.calories) bits.push(`${wearable.calories} ккал${wearable.caloriesSource === "estimate" ? " оценка" : ""}`);
  if (wearable.sleepMinutes) bits.push(`сон ${wearableApi().formatMinutes(wearable.sleepMinutes)}`);
  if (wearable.restingHr) bits.push(`пульс покоя ${wearable.restingHr}`);
  if (wearable.hrAvg) bits.push(`пульс сессии ${wearable.hrAvg} (${wearable.hrMin}–${wearable.hrMax})`);
  if (wearable.steps != null) bits.push(`шаги ${Number(wearable.steps).toLocaleString("ru-RU")}`);
  return bits.length ? `Браслет: ${bits.join(", ")}` : "";
}

function renderBandAnalytics() {
  const box = elements.bandChart;
  if (!box) return;
  const rows = state.workouts
    .filter((workout) => workout.wearable?.calories || workout.wearable?.hrAvg)
    .slice(-8)
    .reverse();
  if (!rows.length) {
    box.innerHTML = `<div class="empty">После тренировок здесь появятся зоны и калории с браслета.</div>`;
    return;
  }
  const order = wearableApi()?.ZONE_ORDER || Object.keys(ZONE_COLORS);
  box.innerHTML = rows.map((workout) => {
    const band = workout.wearable;
    const kcal = Number(band.calories) || 0;
    const shares = band.zoneShares || {};
    const zoneBar = order.some((key) => shares[key])
      ? `<div class="band-stack band-stack-thin">${order.map((key) =>
        shares[key] ? `<span style="flex:${shares[key]};background:${ZONE_COLORS[key]}"></span>` : "").join("")}</div>`
      : "";
    return `
      <div class="band-history-row">
        <div>
          <strong>${formatDate(workout.date)}</strong>
          <small>${escapeHtml(band.sessionTypeLabel || "без пульса")}</small>
        </div>
        <div class="band-history-nums">
          <b>${kcal || "—"}<small> ккал</small></b>
          <span>${band.hrAvg ? `♥ ${band.hrAvg}` : "♥ —"}</span>
        </div>
        ${zoneBar}
      </div>
    `;
  }).join("");
}
