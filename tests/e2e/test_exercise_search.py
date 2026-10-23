from playwright.sync_api import expect

from test_trainy_regression import prepare_local_stub


def test_workout_has_exercise_search_and_no_builder(local_server, browser_context):
    page = browser_context.new_page()
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")

    expect(page.locator("#builderGoalSelect")).to_have_count(0)
    expect(page.locator("#exerciseSelect")).to_have_count(0)
    expect(page.locator("#exerciseSearchInput")).to_be_hidden()

    page.click("#openPlanEditor")
    page.click("#openExercisePicker")
    expect(page.locator("#exerciseSearchInput")).to_be_visible()

    total = page.locator("#exercisePickList [data-exercise-id]").count()
    page.fill("#exerciseSearchInput", "тяг")
    filtered = page.locator("#exercisePickList [data-exercise-id]").count()
    assert 0 < filtered < total
    names = page.locator("#exercisePickList [data-exercise-id]").all_text_contents()
    assert names
    assert all("тяг" in name.lower() for name in names)

    page.fill("#exerciseSearchInput", "ыыыыынеттакого")
    expect(page.locator("#exercisePickList")).to_contain_text("Ничего не нашлось")
    expect(page.locator("#exercisePickList [data-exercise-id]")).to_have_count(0)
