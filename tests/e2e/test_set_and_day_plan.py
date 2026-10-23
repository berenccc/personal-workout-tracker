from playwright.sync_api import expect

from test_trainy_regression import add_plan_exercise, first_exercise_value, prepare_local_stub


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

    add_plan_exercise(page, first_exercise_value(page))
    page.click("#startWorkoutButton")

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
        () => [...document.querySelectorAll("#exercisePickList [data-exercise-id]")]
          .map((button) => button.dataset.exerciseId)
          .filter(Boolean)
          .slice(0, 2)
        """
    )
    assert len(ids) >= 2
    set_date(page, "2026-10-01")
    page.click("#openPlanEditor")
    page.click("#openExercisePicker")
    page.click(f'#exercisePickList [data-exercise-id="{ids[0]}"]')
    title = page.locator(".exercise-card h3").text_content()
    page.click("#closePlanEditor")
    expect(page.locator(".exercise-card")).to_be_hidden()
    expect(page.locator("#planSummary")).to_contain_text(title)

    set_date(page, "2026-10-02")
    expect(page.locator(".exercise-card")).to_have_count(0)

    page.click("#openPlanEditor")
    page.click("#openExercisePicker")
    page.click(f'#exercisePickList [data-exercise-id="{ids[1]}"]')
    page.click("#closePlanEditor")
    expect(page.locator(".exercise-card h3")).not_to_have_text(title)

    set_date(page, "2026-10-01")
    expect(page.locator(".exercise-card h3")).to_have_text(title)
    stored = page.evaluate("() => JSON.parse(localStorage.getItem('training-tracker-day-plans-v1'))")
    assert stored["2026-10-01"]["exercises"][0]["exerciseId"] == ids[0]
    assert stored["2026-10-02"]["exercises"][0]["exerciseId"] == ids[1]


def test_live_workout_edits_keep_the_list_and_fit_the_screen(local_server, browser_context):
    page = browser_context.new_page()
    page.set_viewport_size({"width": 390, "height": 844})
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")

    ids = page.evaluate(
        """
        () => [...document.querySelectorAll("#exercisePickList [data-exercise-id]")]
          .map((button) => button.dataset.exerciseId)
          .filter(Boolean)
          .slice(0, 2)
        """
    )
    assert len(ids) >= 2
    add_plan_exercise(page, ids[0])
    add_plan_exercise(page, ids[1])
    page.click("#startWorkoutButton")

    expect(page.locator("#afterNotesInput")).to_have_js_property("tagName", "TEXTAREA")
    page.locator(".set-rest-list summary").click()
    expect(page.locator(".set-rest-list")).to_have_js_property("open", True)

    before = page.locator(".set-rest-list h3").all_text_contents()
    page.locator(".set-rest-list .move-down").first.click()
    expect(page.locator(".set-rest-list")).to_have_js_property("open", True)
    swapped = page.locator(".set-rest-list h3").all_text_contents()
    assert swapped == [before[1], before[0]]

    page.locator(".set-rest-list .move-up").nth(1).click()
    expect(page.locator(".set-rest-list")).to_have_js_property("open", True)
    assert page.locator(".set-rest-list h3").all_text_contents() == before

    page.locator(".set-rest-list h3").nth(1).click()
    expect(page.locator(".set-focus .set-name")).to_have_text(before[1])
    expect(page.locator(".set-rest-list")).to_have_js_property("open", True)

    kicker = page.locator(".set-focus .set-kicker").inner_text()
    page.locator(".set-focus .set-all summary").click()
    page.locator(".set-focus .add-set").click()
    expect(page.locator(".set-focus .set-kicker")).not_to_have_text(kicker)
    expect(page.locator(".set-focus .set-all")).to_have_js_property("open", True)
    expect(page.locator(".set-rest-list")).to_have_js_property("open", True)

    fits = page.evaluate(
        """() => {
          const panel = document.querySelector(".workout-panel").getBoundingClientRect();
          const focus = document.querySelector(".set-focus").getBoundingClientRect();
          return focus.left >= panel.left - 1
            && focus.right <= panel.right + 1
            && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
        }"""
    )
    assert fits
