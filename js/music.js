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

// Без доступа или без плеера полоса только мешала бы, поэтому подсказываем об этом лишь во время тренировки.
function renderMusicBar() {
  const node = elements.musicBar;
  if (!node) return;
  const state = musicState;
  const live = workoutIsLive();
  const visible = Boolean(state) && (state.active && state.granted ? true : live);
  node.hidden = !visible;
  document.documentElement.classList.toggle("has-music-bar", visible);
  if (!visible) return;
  if (node.contains(document.activeElement) && document.activeElement.matches('input[type="range"]')) return;

  if (!state.granted) {
    node.innerHTML = `
      <div class="music-row">
        <p class="music-hint">Музыка: дай Trainy доступ к уведомлениям, чтобы листать YouTube Music отсюда.</p>
        <button class="music-link" type="button" data-music="access">Дать доступ</button>
      </div>`;
    return;
  }
  if (!state.active) {
    node.innerHTML = `
      <div class="music-row">
        <p class="music-hint">Плеер не запущен.</p>
        <button class="music-link" type="button" data-music="open">YouTube Music</button>
      </div>`;
    return;
  }

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

  node.innerHTML = `
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
    </div>
    ${musicExpanded ? `
      <div class="music-more">
        ${volumeMax ? `
          <label class="music-volume">
            <span>Громкость</span>
            <input type="range" min="0" max="${volumeMax}" step="1" value="${Number(state.volume) || 0}" data-music-volume />
          </label>` : ""}
        <span class="music-more-title">Дальше в очереди</span>
        ${queueHtml}
        <button class="music-link" type="button" data-music="open">Открыть YouTube Music</button>
      </div>` : ""}
  `;
}

function bindMusicBar() {
  const node = elements.musicBar;
  if (!node) return;
  node.addEventListener("click", (event) => {
    const button = event.target.closest("[data-music]");
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.music;
    if (action === "expand") {
      musicExpanded = !musicExpanded;
      renderMusicBar();
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
}
