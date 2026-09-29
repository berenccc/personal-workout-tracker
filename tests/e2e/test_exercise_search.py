from playwright.sync_api import expect

from test_trainy_regression import prepare_local_stub


def test_workout_has_exercise_search_and_no_builder(local_server, browser_context):
    page = browser_context.new_page()
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")
    page.click("#startWorkoutButton")

    expect(page.locator("#builderGoalSelect")).to_have_count(0)
    expect(page.locator("#exerciseSearchInput")).to_be_visible()

    total = page.locator("#exerciseSelect option").count()
    page.fill("#exerciseSearchInput", "тяг")
    filtered = page.locator("#exerciseSelect option").count()
    assert 0 < filtered < total
    names = page.locator("#exerciseSelect option").all_text_contents()
    assert names
    assert all("тяг" in name.lower() for name in names)

    page.fill("#exerciseSearchInput", "ыыыыынеттакого")
    expect(page.locator("#exerciseSelect option")).to_have_text("Ничего не нашлось")
