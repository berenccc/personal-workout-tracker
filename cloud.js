// Аккаунт, облачная синхронизация и AI через Supabase.
(function () {
  const config = window.SUPABASE_CONFIG || {};

  const els = {
    authForm: document.querySelector("#cloudAuthForm"),
    authEmailRow: document.querySelector("#authEmailRow"),
    authOtpRow: document.querySelector("#authOtpRow"),
    authEmailInput: document.querySelector("#authEmailInput"),
    authOtpInput: document.querySelector("#authOtpInput"),
    authSendCodeButton: document.querySelector("#authSendCodeButton"),
    authVerifyButton: document.querySelector("#authVerifyButton"),
    authChangeEmailButton: document.querySelector("#authChangeEmailButton"),
    authStatus: document.querySelector("#authStatus"),
    cloudStatus: document.querySelector("#cloudStatus"),
    cloudLoggedIn: document.querySelector("#cloudLoggedIn"),
    syncButton: document.querySelector("#cloudSyncButton"),
    signOutButton: document.querySelector("#cloudSignOutButton"),
  };

  let client = null;
  let currentUser = null;
  let pendingEmail = "";
  let lastSyncedUserId = null;

  function setAuthStatus(text, isError = false) {
    if (!els.authStatus) return;
    els.authStatus.textContent = text;
    els.authStatus.classList.toggle("is-error", isError);
  }

  function setCloudStatus(text) {
    if (els.cloudStatus) els.cloudStatus.textContent = text;
  }

  function showEmailStep() {
    if (els.authEmailRow) els.authEmailRow.hidden = false;
    if (els.authOtpRow) els.authOtpRow.hidden = true;
  }

  function showOtpStep() {
    if (els.authEmailRow) els.authEmailRow.hidden = true;
    if (els.authOtpRow) els.authOtpRow.hidden = false;
    els.authOtpInput?.focus();
  }

  function setAuthenticated(user) {
    currentUser = user || null;
    document.body.classList.toggle("locked", !currentUser);
    if (els.cloudLoggedIn) els.cloudLoggedIn.hidden = !currentUser;

    if (currentUser) {
      setCloudStatus(`${currentUser.email} · защищённое облако`);
      setAiStatus?.("AI работает через защищённый сервер.");
    } else {
      setCloudStatus("Войди в аккаунт, чтобы синхронизировать данные.");
      showEmailStep();
    }
  }

  function workoutKey(workout, index) {
    return workout.id || `legacy-${workout.date}-${index}`;
  }

  async function sendCode(event) {
    event?.preventDefault();
    const email = (els.authEmailInput?.value || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setAuthStatus("Введи корректный email.", true);
      return;
    }

    els.authSendCodeButton.disabled = true;
    setAuthStatus("Отправляем код…");
    try {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      pendingEmail = email;
      showOtpStep();
      setAuthStatus(`Код отправлен на ${email}. Можно также перейти по ссылке из письма.`);
    } catch (error) {
      setAuthStatus(`Не удалось отправить код: ${error.message || error}`, true);
    } finally {
      els.authSendCodeButton.disabled = false;
    }
  }

  async function verifyCode() {
    const token = (els.authOtpInput?.value || "").trim();
    if (!pendingEmail || token.length < 6) {
      setAuthStatus("Введи код из письма.", true);
      return;
    }

    els.authVerifyButton.disabled = true;
    setAuthStatus("Проверяем код…");
    try {
      const { error } = await client.auth.verifyOtp({
        email: pendingEmail,
        token,
        type: "email",
      });
      if (error) throw error;
      if (els.authOtpInput) els.authOtpInput.value = "";
    } catch (error) {
      setAuthStatus(`Код не подошёл: ${error.message || error}`, true);
    } finally {
      els.authVerifyButton.disabled = false;
    }
  }

  async function signOut() {
    await client.auth.signOut();
    localStorage.removeItem("training-tracker-auth");
    localStorage.removeItem("training-tracker-github-token");
    localStorage.removeItem("training-tracker-ai-key");
    lastSyncedUserId = null;
    setAuthenticated(null);
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

  async function pushRows(rows) {
    for (let i = 0; i < rows.length; i += 50) {
      const { error } = await client
        .from("workouts")
        .upsert(rows.slice(i, i + 50), { onConflict: "user_id,session_uid" });
      if (error) throw error;
    }
  }

  async function fullSync({ quiet = false } = {}) {
    if (!currentUser) return false;
    if (!quiet) setCloudStatus("Синхронизация…");

    try {
      const { data, error } = await client
        .from("workouts")
        .select("session_uid,payload")
        .order("date", { ascending: true });
      if (error) throw error;

      const merged = new Map();
      state.workouts.forEach((workout, index) => merged.set(workoutKey(workout, index), workout));
      const remoteKeys = new Set();

      (data || []).forEach((row) => {
        remoteKeys.add(row.session_uid);
        merged.set(row.session_uid, row.payload);
      });

      state.workouts = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
      saveState();
      render();

      const localOnly = [...merged.entries()].filter(([key]) => !remoteKeys.has(key));
      if (localOnly.length) {
        await pushRows(localOnly.map(([key, workout]) => rowFor(key, workout)));
      }

      // Старые клиентские секреты и флаг общего пароля больше не используются.
      localStorage.removeItem("training-tracker-auth");
      localStorage.removeItem("training-tracker-github-token");
      sessionStorage.removeItem("training-tracker-github-token");
      localStorage.removeItem("training-tracker-ai-key");

      setCloudStatus(`${currentUser.email} · ${merged.size} тренировок в облаке ✓`);
      if (!quiet) showToast("Облако синхронизировано ✓");
      return true;
    } catch (error) {
      setCloudStatus(`Ошибка синхронизации: ${error.message || error}`);
      if (!quiet) showToast("Облако: ошибка синхронизации", "warn");
      return false;
    }
  }

  async function pushWorkout(workout) {
    if (!currentUser || !workout) return false;
    try {
      await pushRows([rowFor(workout.id || `manual-${workout.date}`, workout)]);
      return true;
    } catch {
      return false;
    }
  }

  async function callAi(messages, tools) {
    if (!currentUser) {
      const error = new Error("Нужно войти в аккаунт");
      error.status = 401;
      throw error;
    }

    const { data, error } = await client.functions.invoke("ai-coach", {
      body: { messages, tools },
    });

    if (error) {
      let status = error.context?.status || 500;
      let message = error.message || "AI-сервер не отвечает";
      try {
        const payload = await error.context?.json();
        if (payload?.error) message = payload.error;
      } catch {
        // Ответ без JSON.
      }
      const wrapped = new Error(message);
      wrapped.status = status;
      throw wrapped;
    }

    return data;
  }

  async function handleSession(session) {
    const user = session?.user || null;
    setAuthenticated(user);
    if (!user) {
      setAuthStatus("Войди по email, чтобы продолжить.");
      return;
    }

    setAuthStatus("Вход выполнен.");
    if (lastSyncedUserId !== user.id) {
      lastSyncedUserId = user.id;
      await fullSync({ quiet: true });
    }
  }

  async function init() {
    if (!config.url || !config.anonKey || !window.supabase) {
      setAuthStatus("Облачный сервис временно недоступен. Попробуй обновить страницу.", true);
      return;
    }

    client = window.supabase.createClient(config.url, config.anonKey);
    els.authForm?.addEventListener("submit", sendCode);
    els.authVerifyButton?.addEventListener("click", verifyCode);
    els.authChangeEmailButton?.addEventListener("click", () => {
      pendingEmail = "";
      showEmailStep();
      setAuthStatus("Введи email.");
    });
    els.authOtpInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        verifyCode();
      }
    });
    els.signOutButton?.addEventListener("click", signOut);
    els.syncButton?.addEventListener("click", () => fullSync());

    client.auth.onAuthStateChange((_event, session) => {
      // Не блокируем внутренний lock Supabase длительной синхронизацией.
      setTimeout(() => handleSession(session), 0);
    });

    const { data } = await client.auth.getSession();
    await handleSession(data.session);
  }

  window.cloudSync = {
    pushWorkout,
    fullSync,
    callAi,
    isAuthenticated: () => Boolean(currentUser),
  };

  init();
})();
