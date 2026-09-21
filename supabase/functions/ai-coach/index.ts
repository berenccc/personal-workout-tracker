import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-trainy-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_TOOLS = new Set([
  "get_recent_workouts",
  "get_planned_workout",
  "get_exercise_catalog",
  "add_new_exercise",
  "add_exercise_to_plan",
  "set_planned_workout",
]);

const SYSTEM_PROMPT = `Ты — AI-помощник внутри приложения Trainy. Отвечай по-русски, кратко и конкретно для чтения с телефона. По умолчанию учитывай контекст тренировок пользователя, но отвечай и на другие вопросы. Вызывай инструменты тренировок только тогда, когда они действительно нужны для ответа или изменения плана.

РАБОТА С ДАННЫМИ:
- Перед оценкой тренировки или изменением плана вызови get_recent_workouts, get_planned_workout и get_exercise_catalog.
- Для разбора последней тренировки используй get_recent_workouts с count от 3 до 12. Для вопросов о прогрессе, плато, рекордах, балансе нагрузки и долгосрочном планировании дополнительно запроси get_recent_workouts с days: 365 — это компактная история за год.
- Полную замену плана делай через set_planned_workout. Во время активной тренировки используй add_exercise_to_plan, чтобы не стереть выполненные подходы.
- Если пользователь просит запланировать следующую тренировку, обязательно вызови set_planned_workout до финального ответа. Описание плана только текстом не выполняет запрос.
- set_planned_workout только ПРЕДЛАГАЕТ план: приложение показывает его с кнопкой «Принять план», и пользователь подтверждает сам. Не пиши «план сохранён» — пиши, что предложил план и ждёшь подтверждения.
- Используй только exerciseId из каталога. Новое упражнение сначала добавляй через add_new_exercise.

МЕТОДИКА:
- Обычно 2–3 рабочих подхода, 6–12 повторов, RPE 6–8 и 2–4 повтора в запасе.
- Не планируй отказ и RPE 9–10, кроме редких обоснованных исключений.
- Давай мышечной группе 48+ часов после тяжёлой нагрузки.
- При острой или повторяющейся боли убирай провоцирующее движение и советуй обратиться к врачу.

СТИЛЬ:
- 2–6 коротких абзацев без markdown-заголовков.
- Давай конкретные веса, повторы и RPE, когда данных достаточно.
- Не выдумывай историю: получай её инструментами.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function sanitizeMessages(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(-30)
    .filter((message) => message && ["user", "assistant", "tool"].includes(message.role))
    .map((message) => {
      const clean: Record<string, unknown> = { role: message.role };
      if (typeof message.content === "string") clean.content = message.content.slice(0, 16000);
      if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
        clean.tool_calls = message.tool_calls.slice(0, 8);
      }
      if (message.role === "tool" && typeof message.tool_call_id === "string") {
        clean.tool_call_id = message.tool_call_id.slice(0, 200);
      }
      return clean;
    });
}

function sanitizeTools(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input.filter((tool) =>
    tool?.type === "function" &&
    ALLOWED_TOOLS.has(tool?.function?.name) &&
    JSON.stringify(tool).length < 12000
  );
}

function sanitizeToolChoice(input: unknown, tools: unknown[]) {
  const name = (input as { function?: { name?: unknown } })?.function?.name;
  if (
    typeof name !== "string" ||
    !ALLOWED_TOOLS.has(name) ||
    !tools.some((tool) =>
      (tool as { function?: { name?: unknown } })?.function?.name === name
    )
  ) {
    return undefined;
  }
  return { type: "function", function: { name } };
}

function hasPersonalAccess(request: Request) {
  const expected = Deno.env.get("TRAINY_PERSONAL_TOKEN") || "trn-psn-k7m2q9w4x8h1c5n3";
  const provided = request.headers.get("x-trainy-token") || "";
  return Boolean(expected) && provided === expected;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!supabaseUrl || !anonKey || !openAiKey) {
    return json({ error: "AI-сервер ещё не настроен" }, 503);
  }

  const authorization = request.headers.get("Authorization");
  let signedIn = false;
  if (authorization) {
    try {
      const supabase = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } },
      });
      const { data: userData } = await supabase.auth.getUser();
      signedIn = Boolean(userData?.user);
    } catch {
      signedIn = false;
    }
  }
  if (!signedIn && !hasPersonalAccess(request)) {
    return json({ error: "AI временно недоступен" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Некорректный запрос" }, 400);
  }

  const messages = sanitizeMessages(body.messages);
  const tools = sanitizeTools(body.tools);
  const toolChoice = sanitizeToolChoice(body.toolChoice, tools);
  if (!messages.length) return json({ error: "Некорректный запрос" }, 400);

  const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-5.6-terra",
      temperature: 0.4,
      max_completion_tokens: 900,
      reasoning_effort: "none",
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT}\n\nСегодня ${new Date().toISOString().slice(0, 10)}.` },
        ...messages,
      ],
      tools,
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
    }),
  });

  const result = await openAiResponse.json().catch(() => ({ error: { message: "Пустой ответ AI" } }));
  if (!openAiResponse.ok) {
    console.error("OpenAI error", openAiResponse.status, result?.error?.message);
    return json({ error: "AI временно недоступен" }, openAiResponse.status === 429 ? 429 : 502);
  }

  return json(result, 200);
});
