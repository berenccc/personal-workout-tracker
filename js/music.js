function musicBridge() {
  return window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.MusicBridge || null : null;
}

async function refreshMusic() {
  const bridge = musicBridge();
  if (!bridge?.state || document.hidden) return;
  try {
    musicState = await bridge.state();
  } catch {
    musicState = null;
  }
  renderMusicCard();
}

function renderMusicCard() {
  const node = elements.musicCard;
  if (!node) return;
  const state = musicState;
  if (!state || !workoutIsLive()) {
    node.hidden = true;
    return;
  }
  node.hidden = false;
  if (!state.granted) {
    node.innerHTML = `
      <div class="music-head"><span>Музыка</span></div>
      <p class="music-note">Чтобы листать треки YouTube Music отсюда, дай Trainy доступ к уведомлениям.</p>
      <button class="button ghost" type="button" data-music="access">Дать доступ</button>
    `;
    return;
  }
  if (!state.active) {
    node.innerHTML = `
      <div class="music-head"><span>Музыка</span></div>
      <p class="music-note">Плеер не запущен.</p>
      <button class="button ghost" type="button" data-music="open">Открыть YouTube Music</button>
    `;
    return;
  }
  const moreOpen = Boolean(node.querySelector(".music-more")?.open);
  const queue = Array.isArray(state.queue) ? state.queue : [];
  const queueHtml = queue.length
    ? `<ol class="music-queue">${queue
        .map(
          (item) =>
            `<li><button type="button" data-music="queue" data-id="${escapeHtml(String(item.id))}"><strong>${escapeHtml(item.title || "Без названия")}</strong>${item.artist ? `<span>${escapeHtml(item.artist)}</span>` : ""}</button></li>`
        )
        .join("")}</ol>`
    : `<p class="music-note">${state.queueKnown ? "Очередь закончилась." : "Плеер не отдаёт очередь."}</p>`;
  node.innerHTML = `
    <div class="music-head">
      <span>Музыка</span>
      <div class="music-now">
        <strong>${escapeHtml(state.title || "Без названия")}</strong>
        ${state.artist ? `<span>${escapeHtml(state.artist)}</span>` : ""}
      </div>
    </div>
    <div class="music-controls">
      <button class="button ghost" type="button" data-music="prev" aria-label="Предыдущий трек">⏮</button>
      <button class="button primary" type="button" data-music="toggle" aria-label="${state.playing ? "Пауза" : "Играть"}">${state.playing ? "⏸" : "▶"}</button>
      <button class="button ghost" type="button" data-music="next" aria-label="Следующий трек">⏭</button>
    </div>
    <details class="music-more"${moreOpen ? " open" : ""}>
      <summary>Дальше в очереди</summary>
      ${queueHtml}
    </details>
  `;
}
