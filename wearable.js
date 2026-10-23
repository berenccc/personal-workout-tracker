(() => {
  const STORAGE_KEY = "training-tracker-band-v1";
  const READ_TYPES = [
    "heartRate",
    "steps",
    "sleep",
    "restingHeartRate",
    "activeCalories",
    "totalCalories",
    "exercise",
    "distance",
    "weight",
  ];
  const ZONE_ORDER = ["warmup", "fat", "aerobic", "anaerobic", "peak"];
  const ZONE_LABELS = {
    warmup: "Разминка",
    fat: "Сжигание жира",
    aerobic: "Аэробная",
    anaerobic: "Анаэробная",
    peak: "Пиковая",
    mixed: "Смешанная",
  };

  function plugin() {
    return window.Capacitor?.Plugins?.BandHealth || null;
  }

  function isNative() {
    return Boolean(window.Capacitor?.isNativePlatform?.() || plugin());
  }

  function loadSnapshot() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return saved && typeof saved === "object" ? saved : null;
    } catch {
      return null;
    }
  }

  function saveSnapshot(snapshot) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return snapshot;
  }

  function formatMinutes(total) {
    const minutes = Math.max(0, Number(total) || 0);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (!hours) return `${rest} мин`;
    return `${hours}ч ${String(rest).padStart(2, "0")}м`;
  }

  function readinessFromSnapshot(snapshot) {
    if (!snapshot?.sleepMinutes) return null;
    const sleepHours = snapshot.sleepMinutes / 60;
    if (sleepHours < 6 || (snapshot.restingHr && snapshot.restingHr >= 76)) return "bad";
    if (sleepHours < 7.25) return "okay";
    return "good";
  }

  function hintFromSnapshot(snapshot) {
    if (!snapshot) return "";
    const bits = [];
    if (snapshot.sleepMinutes) bits.push(`сон ${formatMinutes(snapshot.sleepMinutes)}`);
    if (snapshot.restingHr) bits.push(`пульс покоя ${snapshot.restingHr}`);
    if (snapshot.todayCalories) bits.push(`${snapshot.todayCalories} ккал`);
    if (snapshot.todaySteps != null) bits.push(`шаги ${Number(snapshot.todaySteps).toLocaleString("ru-RU")}`);
    if (!bits.length) return "";
    const readiness = readinessFromSnapshot(snapshot);
    const tone = readiness === "bad" ? "лучше лайт" : readiness === "good" ? "можно обычную" : "без героизма";
    return `${bits.join(" · ")} → ${tone}`;
  }

  function sourceLabel(snapshot) {
    const sources = (snapshot?.sources || []).join(" ").toLowerCase();
    if (/xiaomi|huami|zepp|mifit|wearable|amazfit/.test(sources)) return "Mi Band";
    if (sources) return "Health Connect";
    return "браслет";
  }

  function zoneForBpm(bpm, hrMax) {
    const ratio = bpm / Math.max(hrMax, 1);
    if (ratio < 0.6) return "warmup";
    if (ratio < 0.7) return "fat";
    if (ratio < 0.8) return "aerobic";
    if (ratio < 0.9) return "anaerobic";
    return "peak";
  }

  function analyzeHeart(samples, durationMs, hrMaxHint) {
    const points = (samples || [])
      .map((sample) => ({
        bpm: Number(sample.bpm) || 0,
        time: Date.parse(sample.time),
      }))
      .filter((sample) => sample.bpm > 30 && Number.isFinite(sample.time))
      .sort((a, b) => a.time - b.time);
    if (!points.length) return null;

    const values = points.map((sample) => sample.bpm);
    const hrMax = Math.max(hrMaxHint || 0, Math.max(...values), 190);
    const zones = { warmup: 0, fat: 0, aerobic: 0, anaerobic: 0, peak: 0 };
    const fallbackShare = Math.max(1, Math.round((durationMs || 0) / 1000 / Math.max(points.length, 1)));
    points.forEach((sample, index) => {
      const next = points[index + 1];
      const seconds = next ? Math.max(1, Math.round((next.time - sample.time) / 1000)) : fallbackShare;
      zones[zoneForBpm(sample.bpm, hrMax)] += seconds;
    });
    const total = ZONE_ORDER.reduce((sum, key) => sum + zones[key], 0) || 1;
    const shares = {};
    ZONE_ORDER.forEach((key) => {
      shares[key] = Math.round((zones[key] / total) * 100);
    });
    const top = ZONE_ORDER.slice().sort((a, b) => zones[b] - zones[a])[0];
    const sessionType = shares[top] >= 40 ? top : "mixed";
    return {
      hrAvg: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      hrMin: Math.min(...values),
      hrMax: Math.max(...values),
      hrCount: values.length,
      hrSeries: downsampleSeries(points),
      zones,
      zoneShares: shares,
      sessionType,
      sessionTypeLabel: ZONE_LABELS[sessionType],
      hrMaxUsed: hrMax,
    };
  }

  function downsampleSeries(points, maxPoints = 240) {
    if (points.length <= maxPoints) {
      return points.map((sample) => ({ t: new Date(sample.time).toISOString(), bpm: sample.bpm }));
    }
    const step = points.length / maxPoints;
    return Array.from({ length: maxPoints }, (_, index) => {
      const sample = points[Math.min(points.length - 1, Math.floor(index * step))];
      return { t: new Date(sample.time).toISOString(), bpm: sample.bpm };
    });
  }

  function estimateCalories({ minutes, hrAvg, weightKg = 80, age = 30 }) {
    const duration = Math.max(1, Number(minutes) || 0);
    if (hrAvg) {
      const perMin = (-55.0969 + 0.6309 * hrAvg + 0.1988 * weightKg + 0.2017 * age) / 4.184;
      return Math.max(1, Math.round(perMin * duration));
    }
    return Math.max(1, Math.round(5 * weightKg * (duration / 60)));
  }

  async function availability() {
    const native = plugin();
    if (!native) {
      return { available: false, platform: "web", reason: "web" };
    }
    try {
      return await native.isAvailable();
    } catch {
      return { available: false, platform: "android", reason: "error" };
    }
  }

  async function connect() {
    const native = plugin();
    if (!native) throw new Error("Mi Band доступен только в Android-приложении");
    const status = await native.isAvailable();
    if (!status?.available) {
      await native.openSettings?.();
      throw new Error(
        status?.reason === "update"
          ? "Обнови Health Connect и включи обмен в Mi Fitness"
          : "Поставь Health Connect и включи обмен в Mi Fitness"
      );
    }
    const result = await native.requestAuthorization({ read: READ_TYPES, write: [] });
    if (result && result.available === false) {
      await native.openSettings?.();
      throw new Error("Health Connect ещё не готов на этом телефоне");
    }
    if (!result?.authorized && !(result?.readAuthorized || []).length) {
      throw new Error("Не выдал доступ к пульсу, калориям, сну и шагам");
    }
    return refresh();
  }

  async function refresh() {
    const native = plugin();
    if (!native) throw new Error("Mi Band доступен только в Android-приложении");
    const snapshot = await native.readSnapshot();
    if (!snapshot?.available && snapshot?.authorized !== true && snapshot?.todaySteps == null && snapshot?.sleepMinutes == null) {
      throw new Error("Health Connect не отдал данные. Проверь обмен в Mi Fitness.");
    }
    snapshot.hint = hintFromSnapshot(snapshot);
    snapshot.readiness = readinessFromSnapshot(snapshot);
    snapshot.sourceLabel = sourceLabel(snapshot);
    snapshot.updatedAt = snapshot.updatedAt || new Date().toISOString();
    return saveSnapshot(snapshot);
  }

  async function readNativeSession(startedAt, stoppedAt) {
    const native = plugin();
    if (!native?.readSession) {
      if (!native?.readHeartRate) return {};
      return native.readHeartRate({
        startDate: new Date(startedAt).toISOString(),
        endDate: new Date(stoppedAt || Date.now()).toISOString(),
      });
    }
    return native.readSession({
      startDate: new Date(startedAt).toISOString(),
      endDate: new Date(stoppedAt || Date.now()).toISOString(),
    });
  }

  async function sessionMetrics(startedAt, stoppedAt) {
    const native = plugin();
    const snapshot = loadSnapshot() || {};
    const end = stoppedAt || Date.now();
    const minutes = Math.max(1, Math.round(((end - startedAt) || 0) / 60000));
    let raw = {};
    if (native && startedAt) {
      try {
        raw = await readNativeSession(startedAt, end);
        if (!raw?.hrAvg && !raw?.calories) {
          await wait(3500);
          raw = await readNativeSession(startedAt, Date.now());
        }
      } catch {
        raw = {};
      }
    }

    const direct = await readBroadcastSamples();
    if ((direct?.length || 0) > (raw.samples || []).length) raw.samples = direct;
    const heart = analyzeHeart(raw.samples, end - startedAt, snapshot.lastHr);
    const caloriesActive = Number(raw.calories) || 0;
    const caloriesTotal = Number(raw.totalCalories) || 0;
    const caloriesEstimate = estimateCalories({
      minutes,
      hrAvg: heart?.hrAvg,
      weightKg: snapshot.weightKg || 80,
    });
    // Health Connect часто отдаёт заниженные «активные» ккал: берём максимум
    // из того, что реально дал браслет, и честно помечаем источник.
    const caloriesFromBand = Math.max(caloriesActive, caloriesTotal);
    const useBand = caloriesFromBand >= caloriesEstimate * 0.5;
    const bandExercise = (raw.exercises || [])[0];
    const metrics = {
      source: snapshot.sourceLabel || "Mi Band",
      sleepMinutes: snapshot.sleepMinutes || null,
      sleepDeepMinutes: snapshot.sleepDeepMinutes || null,
      sleepLightMinutes: snapshot.sleepLightMinutes || null,
      sleepRemMinutes: snapshot.sleepRemMinutes || null,
      restingHr: snapshot.restingHr || null,
      steps: raw.steps ?? null,
      distanceKm: raw.distanceKm ?? null,
      calories: useBand ? caloriesFromBand : caloriesEstimate,
      caloriesSource: useBand ? "band" : "estimate",
      caloriesActive: caloriesActive || null,
      caloriesTotal: caloriesTotal || null,
      caloriesEstimate,
      caloriesBySource: raw.caloriesBySource || [],
      hrSources: raw.hrSources || [],
      hrRawCount: raw.rawCount || 0,
      windowStart: new Date(startedAt).toISOString(),
      windowEnd: new Date(end).toISOString(),
      syncedAt: new Date().toISOString(),
      exerciseTitle: bandExercise?.title || bandExercise?.type || "",
      ...heart,
    };
    if (!metrics.sessionTypeLabel && bandExercise?.type) {
      metrics.sessionType = "mixed";
      metrics.sessionTypeLabel = bandExercise.type;
    }
    const hasData = metrics.hrAvg || metrics.calories || metrics.sleepMinutes || metrics.restingHr || metrics.steps != null;
    return hasData ? metrics : null;
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  // Браслет синхронизируется с телефоном с задержкой, поэтому сессию нужно уметь
  // перечитать позже — тогда пульс и калории появляются задним числом.
  async function resyncWorkout({ startIso, endIso, dateIso } = {}) {
    const start = Date.parse(startIso);
    const end = Date.parse(endIso);
    let metrics = null;
    if (Number.isFinite(start) && Number.isFinite(end)) {
      metrics = await sessionMetrics(start, end);
    }
    // Окно таймера приложения и запись браслета часто не совпадают.
    // Если пульса нет — ищем самую длинную сессию этого дня в Health Connect.
    if (metrics?.hrAvg && (metrics.hrRawCount || 0) >= 8) return metrics;

    const window = await findDayWorkoutWindow(dateIso);
    if (!window) return metrics;
    const dayMetrics = await sessionMetrics(window.start, window.end);
    if ((dayMetrics?.hrRawCount || 0) > (metrics?.hrRawCount || 0)) return dayMetrics;
    if (dayMetrics?.hrAvg && !metrics?.hrAvg) return dayMetrics;
    return dayMetrics || metrics;
  }

  // Для старых записей времени старта нет: берём самую длинную тренировку дня из Health Connect.
  async function findDayWorkoutWindow(dateIso) {
    const native = plugin();
    if (!native?.readSession || !dateIso) return null;
    const dayStart = new Date(`${dateIso}T00:00:00`);
    if (Number.isNaN(dayStart.getTime())) return null;
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
    let raw;
    try {
      raw = await native.readSession({
        startDate: dayStart.toISOString(),
        endDate: dayEnd.toISOString(),
      });
    } catch {
      return null;
    }
    const sessions = (raw?.exercises || [])
      .map((item) => ({ start: Date.parse(item.start), end: Date.parse(item.end) }))
      .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start);
    if (sessions.length) {
      return sessions.sort((a, b) => b.end - b.start - (a.end - a.start))[0];
    }
    // Xiaomi иногда пишет только пульс, без карточки тренировки.
    const times = (raw?.samples || [])
      .map((sample) => Date.parse(sample.time))
      .filter((time) => Number.isFinite(time));
    if (times.length < 8) return null;
    return { start: Math.min(...times), end: Math.max(...times) };
  }

  async function diagnostics(startIso, endIso) {
    const native = plugin();
    if (!native?.readDiagnostics) return null;
    return native.readDiagnostics({
      startDate: startIso || new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
      endDate: endIso || new Date().toISOString(),
    });
  }

  async function openSettings() {
    const native = plugin();
    if (!native) throw new Error("Открой приложение на Android");
    await native.openSettings();
  }

  async function startBandWorkout() {
    const native = plugin();
    if (!native?.startBandWorkout) return { nudged: false, autoStart: false };
    const result = await native.startBandWorkout();
    try {
      await native.requestBackgroundRead?.();
    } catch {
      // без фонового чтения пульс обновится, когда вернёшься в приложение
    }
    return result;
  }

  async function stopBandWorkout() {
    const native = plugin();
    if (!native?.stopBandWorkout) return;
    try {
      await native.stopBandWorkout();
    } catch {
      // уведомление само погаснет
    }
  }

  async function readBroadcastSamples() {
    const bridge = window.Capacitor?.Plugins?.WidgetBridge;
    if (!bridge?.broadcastHeartSamples) return [];
    try {
      const result = await bridge.broadcastHeartSamples();
      return result?.samples || [];
    } catch {
      return [];
    }
  }

  function median(values) {
    const sorted = [...values].sort((left, right) => left - right);
    const mid = Math.floor(sorted.length / 2);
    if (!sorted.length) return 0;
    if (sorted.length % 2) return sorted[mid];
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  // Живой пульс — последний замер, не пик и не среднее за несколько минут.
  // Одинокая высокая точка в конце пачки у Mi Fitness часто максимум интервала,
  // а на экране браслета в это время уже заметно меньше.
  function pickLiveReading(samples, now = Date.now()) {
    const recent = (samples || [])
      .map((sample) => ({ bpm: Number(sample.bpm) || 0, t: Date.parse(sample.time || sample.t) }))
      .filter((sample) => sample.bpm >= 35 && sample.bpm <= 210 && Number.isFinite(sample.t))
      .filter((sample) => now - sample.t <= 90000 && sample.t - now <= 5000)
      .sort((left, right) => left.t - right.t);
    if (!recent.length) return null;
    const newest = recent[recent.length - 1];
    const age = now - newest.t;
    if (age > 75000) return null;
    const prior = recent.filter((sample) => sample !== newest && newest.t - sample.t <= 40000);
    let bpm = newest.bpm;
    if (prior.length >= 2) {
      const mid = median(prior.map((sample) => sample.bpm));
      if (bpm - mid >= 18) bpm = mid;
    }
    return { bpm: Math.round(bpm), at: newest.t, age, stale: age > 20000 };
  }

  async function liveHeartRate() {
    const bridge = window.Capacitor?.Plugins?.WidgetBridge;
    if (bridge?.broadcastHeartRate) {
      try {
        const direct = await bridge.broadcastHeartRate();
        const at = Number(direct?.at);
        if (direct?.bpm && at && Date.now() - at < 15000) return { bpm: direct.bpm, at, age: Date.now() - at, stale: false, source: "band" };
      } catch {
        // трансляция не обязательна: ниже остаётся Health Connect
      }
    }
    const native = plugin();
    if (!native?.readHeartRate) return null;
    const end = Date.now();
    const result = await native.readHeartRate({
      startDate: new Date(end - LAST_KNOWN_MS).toISOString(),
      endDate: new Date(end + 5000).toISOString(),
    });
    const samples = [...(result?.samples || [])];
    if (result?.latestBpm && result?.latestAt) samples.push({ bpm: result.latestBpm, time: result.latestAt });
    return pickLiveReading(samples, end) || lastKnownReading(samples, end);
  }

  // Mi Fitness пишет пульс в Health Connect пачками с задержкой, поэтому
  // свежего замера часто нет. Тогда отдаём последний известный — с возрастом.
  const LAST_KNOWN_MS = 20 * 60 * 1000;

  function lastKnownReading(samples, now = Date.now()) {
    const newest = (samples || [])
      .map((sample) => ({ bpm: Number(sample.bpm) || 0, t: Date.parse(sample.time || sample.t) }))
      .filter((sample) => sample.bpm >= 35 && sample.bpm <= 210 && Number.isFinite(sample.t))
      .filter((sample) => now - sample.t <= LAST_KNOWN_MS && sample.t - now <= 5000)
      .sort((left, right) => right.t - left.t)[0];
    if (!newest) return null;
    return { bpm: Math.round(newest.bpm), at: newest.t, age: now - newest.t, stale: true };
  }

  window.TrainyWearable = {
    isNative,
    loadSnapshot,
    saveSnapshot,
    formatMinutes,
    readinessFromSnapshot,
    hintFromSnapshot,
    availability,
    connect,
    refresh,
    sessionMetrics,
    resyncWorkout,
    diagnostics,
    liveHeartRate,
    pickLiveReading,
    lastKnownReading,
    zoneForBpm,
    openSettings,
    startBandWorkout,
    stopBandWorkout,
    ZONE_ORDER,
    ZONE_LABELS,
  };
})();
