from playwright.sync_api import expect

from test_trainy_regression import prepare_local_stub


def test_widget_start_asks_before_starting(local_server, browser_context):
    page = browser_context.new_page()
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")

    page.click('.bottom-nav-btn[data-target="calendar"]')
    page.evaluate("() => window.trainyHandleWidgetAction('start')")

    prompt = page.locator("#startPrompt")
    expect(prompt).to_be_visible()
    expect(page.locator('.bottom-nav-btn[data-target="workout"]')).to_have_class("bottom-nav-btn is-active")
    expect(page.locator(".workout-panel.is-active")).to_have_count(0)

    page.click('[data-start-prompt="cancel"]')
    expect(prompt).to_have_count(0)
    expect(page.locator(".workout-panel.is-active")).to_have_count(0)

    page.evaluate("() => window.trainyHandleWidgetAction('start')")
    page.click('[data-start-prompt="go"]')
    expect(page.locator(".workout-panel.is-active")).to_have_count(1)


def test_widget_open_during_workout_skips_prompt(local_server, browser_context):
    page = browser_context.new_page()
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")

    page.click("#startWorkoutButton")
    page.evaluate("() => window.trainyHandleWidgetAction('start')")
    expect(page.locator("#startPrompt")).to_have_count(0)
    expect(page.locator(".workout-panel.is-active")).to_have_count(1)
