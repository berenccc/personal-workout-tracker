// ── Облако: аккаунт и синхронизация тренировок через Supabase ───────
// Работает поверх training-tracker.js (использует его глобальные state/saveState/render/showToast).
// Если SUPABASE_CONFIG пуст или CDN недоступен — приложение живёт как раньше, локально.
(function () {
  const config = window.SUPABASE_CONFIG || {};

  const els = {
    status: document.querySelector("#cloudStatus"),
    loggedOut: document.querySelector("#cloudLoggedOut"),
    otpRow: document.querySelector("#cloudOtpRow"),
    loggedIn: document.querySelector("#cloudLoggedIn"),
    emailInput: document.querySelector("#cloudEmailInput"),
    otpInput: document.querySelector("#cloudOtpInput"),
    sendCodeButton: document.querySelector("#cloudSendCodeButton"),
    verifyButton: document.querySelector("#cloudVerifyButton"),
    syncButton: document.querySelector("#cloudSyncButton"),
    signOutButton: document.querySelector("#cloudSignOutButton"),
  };

  let client = null;
  let currentUser = null;
  let pendingEmail = null;

  function enabled() {
    return Boolean(config.url && config.anonKey && window.supabase);
  }

  function setStatus(text) {
    if (els.status) els.status.textContent = text;
  }

  function setUiMode(mode) {
    if (!els.loggedOut) return;
    els.loggedOut.hidden = mode !== "logged-out";
    if (els.otpRow) els.otpRow.hidden = mode !== "otp";
    if (els.loggedIn) els.loggedIn.hidden = mode !== "logged-in";
  }

  function workoutKey(workout, index) {
    return workout.id || `legacy-${workout.date}-${index}`;
  }

  async function sendCode() {
    const email = (els.emailInput?.value || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setStatus("Введи корректный email.");
      return;
    }
    els.sendCodeButton.disabled = true;
    try {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      pendingEmail = email;
      setUiMode("otp");
      setStatus(`Код отправлен на ${email}. Введи его сюда.`);
    } catch (error) {
      setStatus(`Не удалось отправить код: ${error.message || error}`);
    } finally {
      els.sendCodeButton.disabled = false;
    }
  }

  async function verifyCode() {
    const token = (els.otpInput?.value || "").trim();
    if (!pendingEmail || !token) {
      setStatus("Введи код из письма.");
      return;
    }
    els.verifyButton.disabled = true;
    try {
      const { error } = await client.auth.verifyOtp({ email: pendingEmail, token, type: "email" });
      if (error) throw error;
      if (els.otpInput) els.otpInput.value = "";
      // Дальше отработает onAuthStateChange.
    } catch (error) {
      setStatus(`Код не подошёл: ${error.message || error}`);
    } finally {
      els.verifyButton.disabled = false;
    }
  }

  async function signOut() {
    await client.auth.signOut();
  }

  async function pushRows(rows) {
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      const { error } = await client
        .from("workouts")
        .upsert(chunk, { onConflict: "user_id,session_uid" });
      if (error) throw error;
    }
  }

  function rowFor(key, workout) {
    return {
      user_id: currentUser.id,
      session_uid: key,
      date: workout.date,
      payload: workout,
      updated_at: new Date().toISOString(),
    };
  }

  // Полная синхронизация: тянем облако, объединяем с локальным, доливаем недостающее наверх.
  async function fullSync() {
    if (!currentUser) return;
    setStatus("Синхронизация…");
    try {
      const { data, error } = await client
        .from("workouts")
        .select("session_uid,payload")
        .order("date", { ascending: true });
      if (error) throw error;

      const merged = new Map();
      state.workouts.forEach((workout, index) => merged.set(workoutKey(workout, index), workout));
      const remoteKeys = new Set();
      data.forEach((row) => {
        remoteKeys.add(row.session_uid);
        merged.set(row.session_uid, row.payload); // облако — источник истины при совпадении ключей
      });

      state.workouts = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
      saveState();
      render();

      const localOnly = [...merged.entries()].filter(([key]) => !remoteKeys.has(key));
      if (localOnly.length) {
        await pushRows(localOnly.map(([key, workout]) => rowFor(key, workout)));
      }

      setStatus(`${currentUser.email} · ${merged.size} тренировок в облаке ✓`);
      showToast("Облако синхронизировано ✓");
    } catch (error) {
      setStatus(`Ошибка синхронизации: ${error.message || error}`);
      showToast("Облако: ошибка синхронизации", "warn");
    }
  }

  // Быстрый пуш одной тренировки после «Завершить тренировку».
  async function pushWorkout(workout) {
    if (!enabled() || !currentUser || !workout) return false;
    try {
      await pushRows([rowFor(workout.id || `manual-${workout.date}`, workout)]);
      return true;
    } catch (error) {
      showToast("В облако не ушло — синхронизируй из Кабинета", "warn");
      return false;
    }
  }

  function handleSession(session) {
    currentUser = session?.user || null;
    if (currentUser) {
      setUiMode("logged-in");
      setStatus(`${currentUser.email} · подтягиваю тренировки…`);
      fullSync();
    } else {
      setUiMode("logged-out");
      setStatus("Войди по email — тренировки будут храниться в облаке.");
    }
  }

  function init() {
    if (!els.status) return;

    if (!config.url || !config.anonKey) {
      setStatus("Облако не настроено (supabase-config.js пуст) — данные живут локально и в git.");
      setUiMode("none");
      return;
    }
    if (!window.supabase) {
      setStatus("Библиотека облака не загрузилась — проверь соединение.");
      setUiMode("none");
      return;
    }

    client = window.supabase.createClient(config.url, config.anonKey);

    els.sendCodeButton?.addEventListener("click", sendCode);
    els.verifyButton?.addEventListener("click", verifyCode);
    els.signOutButton?.addEventListener("click", signOut);
    els.syncButton?.addEventListener("click", fullSync);
    els.otpInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") verifyCode();
    });

    client.auth.onAuthStateChange((_event, session) => handleSession(session));
    client.auth.getSession().then(({ data }) => handleSession(data.session));
  }

  window.cloudSync = { pushWorkout, fullSync };
  init();
})();
