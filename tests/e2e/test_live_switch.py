from playwright.sync_api import expect

from test_hr_timeline import collect_errors
from test_music_bar import open_with_music
from test_trainy_regression import add_plan_exercise, prepare_local_stub


def pick_ids(page, count, offset=0):
    return page.evaluate(
        "([offset, count]) => [...document.querySelectorAll('#exercisePickList [data-exercise-id]')]"
        ".slice(offset, offset + count).map((b) => b.dataset.exerciseId)",
        [offset, count],
    )


def plan_names(page):
    return page.evaluate("() => selected.map((item) => findExercise(item.exerciseId).name)")


def test_switch_current_exercise_from_focus_card(local_server, browser_context):
    page = browser_context.new_page()
    errors = collect_errors(page)
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")
    for exercise_id in pick_ids(page, 3, offset=3):
        add_plan_exercise(page, exercise_id)
    page.click("#startWorkoutButton")

    first, second, third = plan_names(page)
    focus = page.locator(".set-focus")
    expect(focus.locator(".set-name")).to_have_text(first)

    focus.locator(".set-switch-toggle").click()
    options = focus.locator("[data-switch-uid]")
    expect(options).to_have_count(2)
    options.filter(has_text=third).click()
    expect(focus.locator(".set-name")).to_have_text(third)
    expect(focus.locator(".set-next")).to_have_text(f"Дальше: {first}")
    expect(focus.locator(".set-switch")).to_be_hidden()

    focus.locator(".set-switch-toggle").click()
    focus.locator("[data-switch-new]").click()
    expect(page.locator("#exercisePickerSheet")).to_be_visible()
    extra = pick_ids(page, 1, offset=10)[0]
    page.click(f'#exercisePickList [data-exercise-id="{extra}"]')
    extra_name = page.evaluate("(id) => findExercise(id).name", extra)
    expect(focus.locator(".set-name")).to_have_text(extra_name)
    assert plan_names(page) == [first, second, extra_name, third]

    page.click(".live-add-exercise")
    page.click(f'#exercisePickList [data-exercise-id="{pick_ids(page, 1, offset=12)[0]}"]')
    expect(page.locator(".set-focus .set-name")).to_have_text(extra_name)
    assert len(plan_names(page)) == 5
    assert not errors


def test_ai_tab_fills_space_under_live_bar(local_server, browser_context):
    page, errors = open_with_music(
        browser_context, local_server, "window.__musicState = { granted: false, active: false };"
    )
    prepare_local_stub(page)
    page.reload(wait_until="domcontentloaded")
    add_plan_exercise(page)
    page.click("#startWorkoutButton")
    page.evaluate("() => window.trainySetKeyboardInset(0)")
    page.click('.bottom-nav-btn[data-target="ai"]')
    expect(page.locator("#musicBar .music-row")).to_be_visible()

    box = page.evaluate(
        """() => ({
          bar: document.querySelector('#musicBar').getBoundingClientRect().bottom,
          top: document.querySelector('.ai-panel').getBoundingClientRect().top,
          bottom: document.querySelector('.ai-panel').getBoundingClientRect().bottom,
          nav: document.querySelector('.bottom-nav').getBoundingClientRect().top,
          scroll: document.documentElement.scrollHeight - innerHeight,
        })"""
    )
    assert box["top"] >= box["bar"], box
    assert 0 <= box["nav"] - box["bottom"] <= 24, box
    assert box["scroll"] <= 0, box
    assert not errors
