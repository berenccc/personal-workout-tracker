import re

from playwright.sync_api import Page, expect


PROD_URL = "https://berenccc.github.io/personal-workout-tracker/training-tracker.html"


def prepare_local_stub(page: Page) -> None:
    page.route(
        "**/cloud.js*",
        lambda route: route.fulfill(
            status=200,
            content_type="application/javascript",
            body="""
            window.cloudSync = {
              pushWorkout: async () => false,
              deleteWorkout: async () => true,
              fullSync: async () => true,
              callAi: async () => ({
                choices: [
                  {
                    message: {
                      content: "Разбор готов: тренировка ровная, держи RPE 7-8 и добавь 1 подход на тягу в следующей сессии.",
                    },
                  },
                ],
              }),
              isAuthenticated: () => false,
              isReady: () => true,
            };
            """,
        ),
    )


def first_exercise_value(page: Page) -> str:
    return page.evaluate(
        """
        () => {
          const select = document.querySelector("#exerciseSelect");
          if (!select || !select.options || !select.options.length) return "";
          const option = [...select.options].find((item) => item.value);
          return option ? option.value : "";
        }
        """
    )


def test_app_opens_without_login(local_server, browser_context):
    page = browser_context.new_page()
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")

    expect(page.locator("body")).not_to_have_class(re.compile(r".*locked.*"))
    expect(page.locator("main.app")).to_be_visible()
    expect(page.locator("#cloudAuthForm")).to_have_count(0)
    expect(page.locator("#startWorkoutButton")).to_be_visible()
    expect(page.locator("#cloudLoggedIn")).to_be_hidden()
    assert first_exercise_value(page), "Каталог упражнений не подгрузился"


def finish_quick_workout(page: Page, after_notes: str = "qa-run") -> None:
    page.click("#startWorkoutButton")
    exercise_id = first_exercise_value(page)
    assert exercise_id, "No exercise option found"

    page.select_option("#exerciseSelect", exercise_id)
    page.click("#addExerciseButton")
    expect(page.locator(".exercise-card")).to_have_count(1)

    page.evaluate(
        """
        () => {
          const input = document.querySelector('.exercise-card input[data-field="done"]');
          if (!input) return;
          input.checked = true;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        """
    )
    page.fill("#afterNotesInput", after_notes)
    page.click("#finishWorkoutButton")


def test_workout_finish_updates_history(local_server, browser_context):
    page = browser_context.new_page()
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")

    finish_quick_workout(page)

    # Разбор после тренировки сам уводит в AI-чат, поэтому возвращаемся к итогам.
    page.click('.bottom-nav-btn[data-target="workout"]')
    finish_notice = page.locator("#finishNotice")
    expect(finish_notice).to_be_visible()
    expect(finish_notice).to_contain_text("сохранена")
    expect(finish_notice).to_contain_text("подходов")

    page.click('.bottom-nav-btn[data-target="cabinet"]')
    expect(page.locator("#historyList .history-item").first).to_contain_text("qa-run")


def test_ai_chat_mocked_and_no_daily_limit_error(local_server, browser_context):
    page = browser_context.new_page()
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")

    page.click('.bottom-nav-btn[data-target="ai"]')
    page.fill("#aiChatInput", "Оцени мою тренировку")
    page.click("#aiChatSendButton")

    bot_message = page.locator(".ai-msg-bot").last
    expect(bot_message).to_be_visible()
    expect(bot_message).to_contain_text("Разбор готов")
    expect(page.locator("#aiChatLog")).not_to_contain_text("Дневной лимит AI исчерпан")
    expect(page.locator("#aiChatLog")).not_to_contain_text("Войди в аккаунт")


def test_next_workout_plan_waits_for_confirmation(local_server, browser_context):
    page = browser_context.new_page()
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")

    finish_quick_workout(page, after_notes="qa-plan")

    offer = page.locator("#aiChatLog .ai-plan-offer")
    expect(offer).to_be_visible()
    expect(offer).to_contain_text("подтверждения")

    # Пока план не принят, на главной пусто и предложение лежит в localStorage.
    assert pending_plan(page) is not None
    page.click('.bottom-nav-btn[data-target="workout"]')
    expect(plan_rows(page)).to_have_count(0)

    page.click('.bottom-nav-btn[data-target="ai"]')
    page.click('[data-ai-plan="accept"]')
    expect(page.locator("#aiChatLog")).to_contain_text("План принят")
    assert pending_plan(page) is None

    page.click('.bottom-nav-btn[data-target="workout"]')
    expect(plan_rows(page)).not_to_have_count(0)


def test_declined_plan_leaves_main_screen_empty(local_server, browser_context):
    page = browser_context.new_page()
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")

    finish_quick_workout(page, after_notes="qa-decline")
    expect(page.locator("#aiChatLog .ai-plan-offer")).to_be_visible()

    page.click('[data-ai-plan="decline"]')
    expect(page.locator("#aiChatLog")).to_contain_text("План отклонён")
    assert pending_plan(page) is None

    page.click('.bottom-nav-btn[data-target="workout"]')
    expect(plan_rows(page)).to_have_count(0)


def pending_plan(page: Page):
    return page.evaluate("() => localStorage.getItem('training-tracker-ai-pending-plan-v1')")


def plan_rows(page: Page):
    return page.locator("#planSummary .plan-summary-list li")


def test_tabs_calendar_and_analytics_render(local_server, browser_context):
    page = browser_context.new_page()
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")

    page.click('.bottom-nav-btn[data-target="calendar"]')
    expect(page.locator("#scheduleCalendar")).to_be_visible()
    expect(page.locator("#calendarStats")).to_be_visible()

    page.click("#calModeButton")
    expect(page.locator("#scheduleCalendar")).to_be_visible()

    page.click('.bottom-nav-btn[data-target="analytics"]')
    expect(page.locator("#chartExerciseSelect")).to_be_visible()
    expect(page.locator("#statsGrid")).to_be_visible()


def test_production_page_loads(browser_context):
    page = browser_context.new_page()
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.goto(PROD_URL, wait_until="domcontentloaded")
    expect(page.locator("body")).to_be_visible()
    assert not any("SyntaxError" in item for item in errors)
