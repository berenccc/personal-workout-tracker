from playwright.sync_api import expect

from test_trainy_regression import prepare_local_stub


def start_with_exercises(page, local_server, count=3):
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")
    page.click("#startWorkoutButton")
    ids = page.evaluate(
        """
        (count) => [...document.querySelectorAll("#exerciseSelect option")]
          .map((option) => option.value)
          .filter(Boolean)
          .slice(0, count)
        """,
        count,
    )
    for exercise_id in ids:
        page.select_option("#exerciseSelect", exercise_id)
        page.click("#addExerciseButton")


def mark_current_set_done(page):
    page.evaluate(
        """
        () => {
          const input = document.querySelector('.set-focus input[data-field="done"]');
          input.checked = true;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        """
    )


def card_titles(page):
    return page.locator(".set-rest-list .exercise-card h3").all_inner_texts()


def test_live_set_card_fits_phone_width(local_server, browser_context):
    page = browser_context.new_page()
    start_with_exercises(page, local_server)
    mark_current_set_done(page)
    expect(page.locator(".rest-timer")).to_be_visible()

    overflow = page.evaluate(
        "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
    )
    assert overflow <= 0
    focus = page.locator(".set-focus").bounding_box()
    assert focus["x"] + focus["width"] <= 390
    for selector in [".rest-timer", ".set-focus .set-row", ".session-timer"]:
        box = page.locator(selector).first.bounding_box()
        assert box["x"] >= 0
        assert box["x"] + box["width"] <= 390, selector


def test_reorder_and_add_sets_repeatedly_during_live_workout(local_server, browser_context):
    page = browser_context.new_page()
    start_with_exercises(page, local_server)
    mark_current_set_done(page)

    page.click(".set-rest-list summary")
    first, second, third = card_titles(page)

    page.locator(".set-rest-list .exercise-card").nth(1).locator(".move-down").click()
    expect(page.locator(".set-rest-list")).to_have_attribute("open", "")
    assert card_titles(page) == [first, third, second]

    page.locator(".set-rest-list .exercise-card").nth(2).locator(".move-up").click()
    page.locator(".set-rest-list .exercise-card").nth(1).locator(".move-up").click()
    assert card_titles(page) == [second, first, third]

    third_card = page.locator(".set-rest-list .exercise-card").nth(2)
    sets_before = third_card.locator(".set-row").count()
    third_card.locator(".add-set").click()
    page.locator(".set-rest-list .exercise-card").nth(2).locator(".add-set").click()
    expect(page.locator(".set-rest-list")).to_have_attribute("open", "")
    expect(page.locator(".set-rest-list .exercise-card").nth(2).locator(".set-row")).to_have_count(sets_before + 2)

    expect(page.locator(".set-focus .set-name")).to_have_text(first)


def test_after_notes_is_multiline(local_server, browser_context):
    page = browser_context.new_page()
    start_with_exercises(page, local_server, count=1)
    notes = page.locator("#afterNotesInput")
    assert notes.evaluate("(node) => node.tagName") == "TEXTAREA"
    text = "Сложно зашёл жим под углом, но был занят тренажёр и я пошёл на штангу. " * 3
    notes.fill(text)
    box = notes.bounding_box()
    assert box["height"] >= 80
    assert box["x"] + box["width"] <= 390
    draft = page.evaluate("() => JSON.parse(localStorage.getItem('training-tracker-active-workout-draft-v1'))")
    assert draft["fields"]["afterNotes"] == text
