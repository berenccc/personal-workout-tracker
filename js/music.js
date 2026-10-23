const MUSIC_POLL_MS = 3000;
const MUSIC_ICONS = {
  prev: "M6 5h2v14H6zM20 5v14L9.5 12z",
  next: "M16 5h2v14h-2zM4 5v14l10.5-7z",
  play: "M7 4.5v15L19.5 12z",
  pause: "M6 5h4v14H6zM14 5h4v14h-4z",
  volumeDown: "M3 9v6h4l5 4V5L7 9zM15 11h6v2h-6z",
  volumeUp: "M3 9v6h4l5 4V5L7 9zM17 8h2v3h3v2h-3v3h-2v-3h-3v-2h3z",
};

function musicBridge() {
  return window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.MusicBridge || null : null;
}

function initMusic() {
  if (!musicBridge()?.state) return;
  refreshMusic();
  musicTimer = window.setInterval(refreshMusic, MUSIC_POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshMusic();
  });
}

async function refreshMusic() {
  const bridge = musicBridge();
  if (!bridge?.state || document.hidden) return;
  try {
    musicState = await bridge.state();
  } catch {
    musicState = null;
  }
  renderMusicBar();
}

async function musicControl(action, extra = {}) {
  const bridge = musicBridge();
  if (!bridge) return;
  try {
    if (action === "access") await bridge.openAccess();
    else if (action === "open") await bridge.openPlayer();
    else await bridge.control({ action, ...extra });
  } catch (error) {
    showToast(error?.message || "Плеер не ответил");
  }
  window.setTimeout(refreshMusic, 500);
}

function musicIcon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${MUSIC_ICONS[name]}"/></svg>`;
}

function musicButton(action, icon, label, primary = false) {
  return `<button class="music-btn${primary ? " is-primary" : ""}" type="button" data-music="${action}" aria-label="${label}">${musicIcon(icon)}</button>`;
}

const LIVE_STRIP_H = 30;
const MUSIC_ROW_H = 52;

function musicRowHtml(state, live) {
  // Без доступа или без плеера строка только мешала бы, поэтому подсказываем об этом лишь во время тренировки.
  if (!state || (!(state.granted && state.active) && !live)) return "";
  if (!state.granted) {
    return `
      <div class="music-row">
        <p class="music-hint">Музыка: дай Trainy доступ к уведомлениям, чтобы листать YouTube Music отсюда.</p>
        <button class="music-link" type="button" data-music="access">Дать доступ</button>
      </div>`;
  }
  if (!state.active) {
    return `
      <div class="music-row">
        <p class="music-hint">Плеер не запущен.</p>
        <button class="music-link" type="button" data-music="expand">Включить</button>
      </div>`;
  }
  return `
    <div class="music-row">
      <button class="music-now" type="button" data-music="expand" aria-expanded="${musicExpanded}">
        <strong>${escapeHtml(state.title || "Без названия")}</strong>
        ${state.artist ? `<span>${escapeHtml(state.artist)}</span>` : ""}
      </button>
      <div class="music-controls">
        ${musicButton("prev", "prev", "Предыдущий трек")}
        ${musicButton("toggle", state.playing ? "pause" : "play", state.playing ? "Пауза" : "Играть", true)}
        ${musicButton("next", "next", "Следующий трек")}
        ${musicButton("volumeDown", "volumeDown", "Тише")}
        ${musicButton("volumeUp", "volumeUp", "Громче")}
      </div>
    </div>`;
}

function musicMoreHtml(state) {
  if (!musicExpanded || !state?.granted) return "";
  const queue = Array.isArray(state.queue) ? state.queue : [];
  const volumeMax = Number(state.volumeMax) || 0;
  const queueHtml = queue.length
    ? `<ol class="music-queue">${queue
        .map(
          (item) =>
            `<li><button type="button" data-music="queue" data-id="${escapeHtml(String(item.id))}"><strong>${escapeHtml(item.title || "Без названия")}</strong>${item.artist ? `<span>${escapeHtml(item.artist)}</span>` : ""}</button></li>`
        )
        .join("")}</ol>`
    : `<p class="music-hint">${state.queueKnown ? "Очередь закончилась." : "Плеер не отдаёт очередь."}</p>`;
  return `
    <div class="music-more">
      <form class="music-search" data-music-search>
        <input type="search" name="query" placeholder="Включить: трек, артист, плейлист" autocomplete="off" enterkeyhint="go" />
        <button class="music-link" type="submit">Включить</button>
      </form>
      ${state.active && volumeMax ? `
        <label class="music-volume">
          <span>Громкость</span>
          <input type="range" min="0" max="${volumeMax}" step="1" value="${Number(state.volume) || 0}" data-music-volume />
        </label>` : ""}
      ${state.active ? `<span class="music-more-title">Дальше в очереди</span>${queueHtml}` : ""}
      <button class="music-link" type="button" data-music="open">Открыть YouTube Music</button>
    </div>`;
}

function liveStripHtml() {
  return `
    <button class="live-strip" type="button" data-music="workout" aria-label="К тренировке">
      <span class="live-time" data-live-time></span>
      <span class="live-rest" data-live-rest hidden></span>
      <span class="live-sets" data-live-sets></span>
      <span class="live-hr" data-live-hr hidden></span>
    </button>`;
}

// Время, отдых и пульс видны на любой вкладке, чтобы во время тренировки не переключаться ради них.
function paintLiveStrip() {
  const strip = elements.musicBar?.querySelector(".live-strip");
  if (!strip) return;
  strip.querySelector("[data-live-time]").textContent = `⏱ ${formatDuration(getWorkoutDurationMs())}`;
  const restLeft = restSecondsLeft();
  const rest = strip.querySelector("[data-live-rest]");
  rest.hidden = restLeft <= 0;
  rest.textContent = restLeft > 0 ? `отдых ${Math.floor(restLeft / 60)}:${String(restLeft % 60).padStart(2, "0")}` : "";
  const sets = selected.flatMap((item) => item.sets);
  strip.querySelector("[data-live-sets]").textContent = `${sets.filter((set) => set.done).length}/${sets.length} подх.`;
  const bpm = freshLiveHr();
  const hr = strip.querySelector("[data-live-hr]");
  hr.hidden = !bpm;
  hr.textContent = bpm ? `♥ ${bpm}` : "";
}

function renderMusicBar() {
  const node = elements.musicBar;
  if (!node) return;
  const live = workoutIsLive();
  const row = musicRowHtml(musicState, live);
  const visible = live || Boolean(row);
  node.hidden = !visible;
  document.documentElement.classList.toggle("has-music-bar", visible);
  document.documentElement.style.setProperty(
    "--top-bar-h",
    `${(live ? LIVE_STRIP_H : 0) + (row ? MUSIC_ROW_H : 0)}px`
  );
  if (!visible) return;
  if (node.contains(document.activeElement) && document.activeElement.matches("input")) {
    paintLiveStrip();
    return;
  }
  node.innerHTML = `${live ? liveStripHtml() : ""}${row}${row ? musicMoreHtml(musicState) : ""}`;
  paintLiveStrip();
}

function bindMusicBar() {
  const node = elements.musicBar;
  if (!node) return;
  node.addEventListener("click", (event) => {
    const button = event.target.closest("[data-music]");
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.music;
    if (action === "workout") {
      window.showAppView?.("workout");
      return;
    }
    if (action === "expand") {
      musicExpanded = !musicExpanded;
      renderMusicBar();
      if (musicExpanded && !musicState?.active) node.querySelector('[data-music-search] input')?.focus();
      return;
    }
    if (action === "toggle" && musicState) {
      musicState.playing = !musicState.playing;
      renderMusicBar();
    }
    musicControl(action, action === "queue" ? { id: Number(button.dataset.id) } : {});
  });
  node.addEventListener("change", (event) => {
    const input = event.target.closest("[data-music-volume]");
    if (!input) return;
    musicControl("volumeSet", { value: Number(input.value) });
    input.blur();
  });
  node.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-music-search]");
    if (!form) return;
    event.preventDefault();
    const query = form.elements.query.value.trim();
    if (!query) return;
    form.elements.query.blur();
    musicExpanded = false;
    musicControl("search", { query });
    showToast(`Включаю: ${query}`);
  });
}

function nowPlayingForAi() {
  const state = musicState;
  if (!musicBridge()) return "Музыка: управление доступно только в Android-приложении.";
  if (!state) return "Музыка: плеер ещё не опрошен.";
  if (!state.granted) return "Музыка: нет доступа к уведомлениям, управлять плеером нельзя.";
  if (!state.active) return "Музыка: плеер не запущен (можно включить поиском).";
  const volume = state.volumeMax ? `, громкость ${state.volume}/${state.volumeMax}` : "";
  const track = [state.title, state.artist].filter(Boolean).join(" — ") || "без названия";
  return `Музыка: ${state.playing ? "играет" : "на паузе"} «${track}»${volume}.`;
}

const AI_MUSIC_ACTIONS = ["next", "prev", "play", "pause", "toggle", "volumeUp", "volumeDown", "setVolume", "search", "open"];

async function aiMusicControl(args) {
  const bridge = musicBridge();
  if (!bridge) return "Ошибка: управление музыкой есть только в Android-приложении.";
  const hasQuery = Boolean(String(args.query || "").trim());
  const action = String(args.action || "") === "play" && hasQuery ? "search" : String(args.action || "");
  if (!AI_MUSIC_ACTIONS.includes(action)) return `Ошибка: неизвестное действие ${action}.`;
  try {
    if (action === "open") await bridge.openPlayer();
    else if (action === "setVolume") {
      const max = Number(musicState?.volumeMax) || 0;
      if (!max) return "Ошибка: плеер не сообщает громкость.";
      const percent = Math.min(Math.max(Number(args.percent) || 0, 0), 100);
      await bridge.control({ action: "volumeSet", value: Math.round((percent / 100) * max) });
    } else if (action === "search") {
      const query = String(args.query || "").trim();
      if (!query) return "Ошибка: для search нужен query.";
      await bridge.control({ action, query });
    } else {
      const steps = action.startsWith("volume") ? Math.min(Math.max(Number(args.steps) || 1, 1), 10) : 1;
      for (let step = 0; step < steps; step += 1) await bridge.control({ action });
    }
  } catch (error) {
    return `Ошибка: ${error?.message || "плеер не ответил"}.`;
  }
  await sleep(700);
  await refreshMusic();
  return `Готово (${action}). ${nowPlayingForAi()}`;
}