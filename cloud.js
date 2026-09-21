// Личный режим: приложение всегда открыто, без окна входа.
// Облако подключается само по персональному токену. AI — без тарифов и OTP.
(function () {
  const config = window.SUPABASE_CONFIG || {};
  const PENDING_KEY = "training-tracker-cloud-pending-v1";

  const els = {
    cloudStatus: document.querySelector("#cloudStatus"),
    cloudLoggedIn: document.querySelector("#cloudLoggedIn"),
    syncButton: document.querySelector("#cloudSyncButton"),
    signOutButton: document.querySelector("#cloudSignOutButton"),
  };

  let client = null;
  let currentUser = null;
  let lastSyncedUserId = null;
  let resolveReady;
  const whenReady = new Promise((resolve) => {
    resolveReady = resolve;
  });

  const OWNER_KEY = "training-tracker-owner-uid";

  function wipeLocalDataForAccountSwitch() {
    [
      "training-tracker-v3",
      "training-tracker-active-workout-draft-v1",
      "training-tracker-ai-chat-v1",
      "training-tracker-ai-plan-v1",
      "training-tracker-ai-post-workout-pending-v1",
      "training-tracker-schedule-v1",
      "training-tracker-weekdays-v1",
      "training-tracker-schedule-exclude-v1",
    ].forEach((key) => localStorage.removeItem(key));
  }

  function setCloudStatus(text) {
    if (els.cloudStatus) els.cloudStatus.textContent = text;
  }

  function setAuthenticated(user) {
    currentUser = user || null;
    document.body.classList.remove("locked");
    if (els.cloudLoggedIn) els.cloudLoggedIn.hidden = !currentUser;
    if (els.signOutButton) els.signOutButton.hidden = true;

    if (currentUser) {
      setCloudStatus("Облако подключено · тренировки пишутся сразу");
      setAiStatus?.("");
    } else {
      setCloudStatus("Подключаю облако…");
    }
    window.updateCabinetStatus?.();
  }

  function workoutKey(workout, index) {
    return workout.id || `legacy-${workout.date}-${index}`;
  }

  function personalHeaders() {
    const headers = {};
    if (config.personalToken) headers["x-trainy-token"] = config.personalToken;
    return headers;
  }

  function readPending() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writePending(workouts) {
    if (!workouts.length) {
      localStorage.removeItem(PENDING_KEY);
      return;
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(workouts.slice(-20)));
  }

  function queuePending(workout) {
    if (!workout) return;
    const key = workoutKey(workout, 0);
    const pending = readPending().filter((item) => workoutKey(item, 0) !== key);
    pending.push(workout);
    writePending(pending);
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
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

  async function invokePersonal(body) {
    if (!client) throw new Error("cloud is not ready");
    const { data, error } = await client.functions.invoke("personal-session", {
      body,
      headers: personalHeaders(),
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function pushViaPersonalToken(workout) {
    const data = await invokePersonal({ workout });
    return Boolean(data?.ok);
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

      setCloudStatus(`Облако подключено · ${merged.size} тренировок`);
      if (!quiet) showToast("Облако синхронизировано ✓");
      return true;
    } catch (error) {
      setCloudStatus(`Ошибка синхронизации: ${error.message || error}`);
      if (!quiet) showToast("Облако: ошибка синхронизации", "warn");
      return false;
    }
  }

  async function pushWorkout(workout, { queued = false } = {}) {
    if (!workout) return false;
    await Promise.race([whenReady, new Promise((resolve) => setTimeout(resolve, 8000))]);
    if (!client) {
      if (!queued) queuePending(workout);
      return false;
    }

    try {
      if (currentUser) {
        await pushRows([rowFor(workout.id || `manual-${workout.date}`, workout)]);
        return true;
      }
    } catch (error) {
      console.warn("cloud rls push failed", error);
    }

    try {
      const ok = await pushViaPersonalToken(workout);
      if (ok) return true;
    } catch (error) {
      console.warn("cloud token push failed", error);
    }

    if (!queued) queuePending(workout);
    return false;
  }

  async function flushPending() {
    const pending = readPending();
    if (!pending.length) return;
    const left = [];
    for (const workout of pending) {
      const ok = await pushWorkout(workout, { queued: true });
      if (!ok) left.push(workout);
    }
    writePending(left);
  }

  async function deleteWorkout(workout) {
    if (!workout) return false;
    const key = workout.id || `manual-${workout.date}`;
    try {
      if (currentUser && client) {
        const { error } = await client.from("workouts").delete().eq("session_uid", key);
        if (!error) return true;
      }
    } catch {
      // fallback below
    }
    try {
      await invokePersonal({ delete: true, session_uid: key });
      return true;
    } catch {
      return false;
    }
  }

  async function callAi(messages, tools, toolChoice) {
    if (!client) {
      const error = new Error("AI-сервер ещё не готов");
      error.status = 503;
      throw error;
    }

    const { data, error } = await client.functions.invoke("ai-coach", {
      body: { messages, tools, toolChoice },
      headers: personalHeaders(),
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

  async function signInWithPersonalToken() {
    if (!client || !config.personalToken) return false;
    try {
      const data = await invokePersonal({});
      if (!data?.token_hash) return false;
      const { error } = await client.auth.verifyOtp({
        token_hash: data.token_hash,
        type: data.type || "email",
      });
      if (error) throw error;
      return true;
    } catch (error) {
      console.warn("personal session", error);
      return false;
    }
  }

  async function handleSession(session) {
    const user = session?.user || null;
    setAuthenticated(user);
    if (!user) return;

    const storedOwner = localStorage.getItem(OWNER_KEY);
    if (storedOwner && storedOwner !== user.id) {
      localStorage.setItem(OWNER_KEY, user.id);
      wipeLocalDataForAccountSwitch();
      window.location.reload();
      return;
    }
    localStorage.setItem(OWNER_KEY, user.id);

    if (lastSyncedUserId !== user.id) {
      lastSyncedUserId = user.id;
      await fullSync({ quiet: true });
    }
    await flushPending();
    window.resumeAiPlanningIfNeeded?.();
  }

  async function init() {
    document.body.classList.remove("locked");
    await window.offlineHistoryReady;
    setCloudStatus("Подключаю облако…");

    if (!config.url || !config.anonKey || !window.supabase) {
      setAuthenticated(null);
      resolveReady();
      return;
    }

    client = window.supabase.createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    els.syncButton?.addEventListener("click", () => fullSync());
    els.signOutButton?.addEventListener("click", signOut);
    if (els.signOutButton) els.signOutButton.hidden = true;

    client.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => handleSession(session), 0);
    });

    try {
      const sessionPromise = client.auth.getSession();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("timeout")), 4000);
      });
      const { data } = await Promise.race([sessionPromise, timeoutPromise]);
      if (data?.session) {
        await handleSession(data.session);
      } else {
        await signInWithPersonalToken();
      }
    } catch {
      await signInWithPersonalToken();
    }

    await flushPending();
    resolveReady();
  }

  window.addEventListener("online", () => {
    flushPending();
  });

  window.cloudSync = {
    pushWorkout,
    deleteWorkout,
    fullSync,
    callAi,
    isAuthenticated: () => Boolean(currentUser),
    isReady: () => Boolean(client),
  };

  init();
})();
