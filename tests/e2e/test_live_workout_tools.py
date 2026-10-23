from playwright.sync_api import expect

from test_hr_timeline import collect_errors
from test_trainy_regression import add_plan_exercise, prepare_local_stub


def exercise_ids(page, count):
    return page.evaluate(
        """
        (count) => [...document.querySelectorAll("#exercisePickList [data-exercise-id]")]
          .map((button) => button.dataset.exerciseId)
          .filter(Boolean)
          .slice(0, count)
        """,
        count,
    )


def start_live(page, url, count=1):
    prepare_local_stub(page)
    page.goto(url, wait_until="domcontentloaded")
    ids = exercise_ids(page, count + 1)
    for exercise_id in ids[:count]:
        add_plan_exercise(page, exercise_id)
    page.click("#startWorkoutButton")
    expect(page.locator(".set-focus")).to_be_visible()
    return ids


def test_feel_scale_replaces_rpe(local_server, browser_context):
    page = browser_context.new_page()
    start_live(page, local_server)

    expect(page.locator("#bandNudge")).to_have_count(0)
    expect(page.locator('.set-focus input[data-field="rpe"]')).to_have_count(0)
    options = page.locator('.set-focus select[data-field="mark"] option').all_text_contents()
    assert options == ["совсем легко", "легко", "в самый раз", "плотно", "тяжело", "пропустил"]

    page.locator('.set-focus select[data-field="mark"]').first.select_option("solid")
    page.evaluate(
        """
        () => {
          const input = document.querySelector('.set-focus input[data-field="done"]');
          input.checked = true;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        """
    )
    first = page.evaluate("() => selected[0].sets[0]")
    assert first["done"] is True
    assert first["mark"] == "solid"
    assert first["rpe"] == 8


def test_all_sets_open_inside_current_exercise(local_server, browser_context):
    page = browser_context.new_page()
    start_live(page, local_server)

    before = page.evaluate("() => selected[0].sets.length")
    page.locator(".set-focus .set-all summary").click()
    expect(page.locator(".set-focus .set-all-list .set-row")).to_have_count(before - 1)
    page.locator(".set-focus .add-set").click()
    assert page.evaluate("() => selected[0].sets.length") == before + 1
    expect(page.locator(".set-focus .set-all")).to_have_js_property("open", True)

    weight = page.locator('.set-focus .set-all-list input[data-field="weight"]').first
    weight.fill("42.5")
    weight.dispatch_event("change")
    assert page.evaluate("() => selected[0].sets[1].weight") in (42.5, "42.5")


def test_exercise_can_be_added_during_live_workout(local_server, browser_context):
    page = browser_context.new_page()
    ids = start_live(page, local_server)

    page.locator(".live-add-exercise").click()
    page.click(f'#exercisePickList [data-exercise-id="{ids[1]}"]')
    expect(page.locator(".workout-panel.is-active")).to_have_count(1)
    order = page.evaluate("() => selected.map((item) => item.exerciseId)")
    assert order == [ids[0], ids[1]]


def test_coach_knows_workout_is_live(local_server, browser_context):
    page = browser_context.new_page()
    start_live(page, local_server)

    result = page.evaluate(
        """
        () => {
          const messages = withLiveWorkoutContext([
            { role: "assistant", content: "Привет" },
            { role: "user", content: "Добавь жим" },
          ]);
          return { first: messages[0].content, last: messages[1].content };
        }
        """
    )
    assert result["first"] == "Привет"
    assert result["last"].startswith("Добавь жим")
    assert "тренировка идёт прямо сейчас" in result["last"]
    assert "add_exercise_to_plan" in result["last"]


def test_ai_can_add_exercise_during_live_workout(local_server, browser_context):
    page = browser_context.new_page()
    errors = collect_errors(page)
    start_live(page, local_server)

    result = page.evaluate(
        """
        () => {
          const target = exercises.find((item) => /жим штанги лёжа/i.test(item.name));
          executeAiTool("add_exercise_to_plan", { exerciseId: target.id, sets: [{ weight: 40, reps: 10 }] });
          return { count: selected.length, cards: document.querySelectorAll(".set-rest-list .exercise-card").length };
        }
        """
    )
    assert result == {"count": 2, "cards": 2}
    assert not errors
