import json

from playwright.sync_api import Page, expect

from test_trainy_regression import finish_quick_workout, pending_plan, prepare_local_stub


def seeded_workouts() -> str:
    def workout(workout_id: str, date: str, note: str) -> dict:
        return {
            "id": workout_id,
            "date": date,
            "durationMinutes": 55,
            "readiness": "good",
            "notes": "",
            "afterNotes": note,
            "exercises": [
                {"exerciseId": "bench-press", "sets": [{"weight": 60, "reps": 8, "rpe": 7, "done": True, "mark": "normal"}]},
            ],
        }

    return json.dumps(
        {
            "version": 3,
            "workouts": [
                workout("qa-aug", "2026-08-28", "август"),
                workout("qa-sep-1", "2026-09-15", "первая"),
                workout("qa-sep-2", "2026-09-19", "вторая"),
            ],
        },
        ensure_ascii=False,
    )


def open_history(page: Page, url: str) -> None:
    prepare_local_stub(page)
    page.add_init_script(f"localStorage.setItem('training-tracker-v3', {json.dumps(seeded_workouts())});")
    page.goto(url, wait_until="domcontentloaded")
    page.click('.bottom-nav-btn[data-target="calendar"]')


def stored_ids(page: Page) -> list:
    return page.evaluate(
        "() => JSON.parse(localStorage.getItem('training-tracker-v3')).workouts.map((w) => w.id)"
    )


def test_history_is_grouped_newest_first(local_server, browser_context):
    page = browser_context.new_page()
    open_history(page, local_server)

    items = page.locator("#historyList .history-item")
    expect(items).to_have_count(3)
    expect(items.first).to_contain_text("вторая")
    expect(page.locator("#historyList .history-month")).to_have_count(2)
    expect(page.locator("#historyMeta")).to_contain_text("3 тренировки")


def test_history_item_expands_and_deletes_with_undo(local_server, browser_context):
    page = browser_context.new_page()
    open_history(page, local_server)

    first = page.locator("#historyList .history-item").first
    first.locator("summary").click()
    delete = first.locator('[data-action="delete-workout"]')
    expect(delete).to_be_visible()
    delete.click()

    expect(page.locator("#historyList .history-item")).to_have_count(2)
    assert "qa-sep-2" not in stored_ids(page)

    page.click(".toast-action")
    expect(page.locator("#historyList .history-item")).to_have_count(3)
    assert "qa-sep-2" in stored_ids(page)


def test_accidental_finish_can_be_resumed(local_server, browser_context):
    page = browser_context.new_page()
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")

    finish_quick_workout(page, after_notes="qa-oops")
    expect(page.locator("#aiChatLog .ai-plan-offer")).to_be_visible()

    page.click('.bottom-nav-btn[data-target="workout"]')
    page.click('#finishNotice [data-action="resume-workout"]')

    expect(page.locator(".workout-panel.is-active")).to_have_count(1)
    expect(page.locator(".exercise-card")).to_have_count(1)
    expect(page.locator("#afterNotesInput")).to_have_value("qa-oops")
    notes = page.evaluate(
        "() => JSON.parse(localStorage.getItem('training-tracker-v3')).workouts.map((w) => w.afterNotes)"
    )
    assert "qa-oops" not in notes
    assert pending_plan(page) is None
