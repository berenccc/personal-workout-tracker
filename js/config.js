const STORAGE_KEY = "training-tracker-v3";
const WORKOUT_DRAFT_KEY = "training-tracker-active-workout-draft-v1";
const AI_CHAT_STORAGE = "training-tracker-ai-chat-v1";
const AI_PLAN_STORAGE = "training-tracker-ai-plan-v1";
const AI_PENDING_PLAN_KEY = "training-tracker-ai-pending-plan-v1";
const AI_POST_WORKOUT_PENDING_KEY = "training-tracker-ai-post-workout-pending-v1";
const DISCARD_TEST_SESSION_KEY = "training-tracker-discard-test-2026-09-21-b";
const TEST_SESSION_DATE = "2026-09-21";
const CUSTOM_EXERCISES_KEY = "training-tracker-custom-exercises-v1";
const OFFLINE_HISTORY_URL = "./data/workouts.json";
const AI_KEY_STORAGE = "training-tracker-ai-key";
const AI_BASE_STORAGE = "training-tracker-ai-base-url";
const AI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
const AI_MODEL = "gpt-5.6-terra";
// Технические предохранители, чтобы не раздувать запрос до лимитов провайдера
// и не зациклить вызовы инструментов.
const AI_MAX_TOOL_ROUNDS = 12;
const AI_CHAT_HISTORY_LIMIT = 60;
// Один запрос не должен висеть вечно, а весь цикл с инструментами — дольше пары минут.
const AI_REQUEST_TIMEOUT_MS = 75000;
const AI_RUN_TIMEOUT_MS = 3 * 60 * 1000;
