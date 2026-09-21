// Конфиг облака. Заполняется после создания проекта на supabase.com:
// Dashboard → Settings → API → "Project URL" и "anon public" ключ.
// anon-ключ публичный по дизайну — доступ к данным ограничивает Row Level Security.
// Пока поля пустые, приложение работает как раньше (локально + git).
window.SUPABASE_CONFIG = {
  url: "https://rntisjabdnyyidqrorkt.supabase.co",
  anonKey: "sb_publishable_-wh5ISxAq8kJlHU7_ZAeqw_vS5vGSpS",
  // Личный доступ к AI без окна входа. Не тариф и не аккаунт.
  personalToken: "trn-psn-k7m2q9w4x8h1c5n3",
};
