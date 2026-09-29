from playwright.sync_api import expect

from test_trainy_regression import first_exercise_value, prepare_local_stub


def set_date(page, iso):
    page.evaluate(
        """
        (iso) => {
          const input = document.querySelector("#dateInput");
          input.value = iso;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        """,
        iso,
    )


def test_workout_uses_one_set_and_finish_needs_two_taps(local_server, browser_context):
    page = browser_context.new_page()
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")

    page.click("#startWorkoutButton")
    exercise_id = first_exercise_value(page)
    page.select_option("#exerciseSelect", exercise_id)
    page.click("#addExerciseButton")

    expect(page.locator(".set-focus .set-name")).to_be_visible()
    expect(page.locator(".set-next")).to_be_visible()
    expect(page.locator(".set-rest-list")).to_be_visible()
    position = page.evaluate("() => getComputedStyle(document.querySelector('.mobile-actions')).position")
    assert position == "static"

    page.evaluate(
        """
        () => {
          const input = document.querySelector('.set-focus input[data-field="done"]');
          input.checked = true;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        """
    )
    expect(page.locator(".rest-timer")).to_be_visible()

    page.click("#finishWorkoutButton")
    expect(page.locator("#finishWorkoutButton")).to_have_text("Ещё раз — завершить")
    expect(page.locator(".workout-panel.is-active")).to_have_count(1)

    page.click("#finishWorkoutButton")
    expect(page.locator(".workout-panel.is-active")).to_have_count(0)


def test_each_date_keeps_its_own_plan(local_server, browser_context):
    page = browser_context.new_page()
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")

    ids = page.evaluate(
        """
        () => [...document.querySelectorAll("#exerciseSelect option")]
          .map((option) => option.value)
          .filter(Boolean)
          .slice(0, 2)
        """
    )
    assert len(ids) >= 2
    set_date(page, "2026-10-01")
    page.select_option("#exerciseSelect", ids[0])
    page.click("#addExerciseButton")
    title = page.locator(".exercise-card h3").inner_text()

    set_date(page, "2026-10-02")
    expect(page.locator(".exercise-card")).to_have_count(0)

    page.select_option("#exerciseSelect", ids[1])
    page.click("#addExerciseButton")
    expect(page.locator(".exercise-card h3")).not_to_have_text(title)

    set_date(page, "2026-10-01")
    expect(page.locator(".exercise-card h3")).to_have_text(title)
    stored = page.evaluate("() => JSON.parse(localStorage.getItem('training-tracker-day-plans-v1'))")
    assert stored["2026-10-01"]["exercises"][0]["exerciseId"] == ids[0]
    assert stored["2026-10-02"]["exercises"][0]["exerciseId"] == ids[1]
