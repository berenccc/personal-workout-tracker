import os

from playwright.sync_api import expect

from test_hr_timeline import collect_errors

MUSIC_STUB = """
window.__musicCalls = [];
window.__musicState = {
  granted: true,
  active: true,
  app: "com.google.android.apps.youtube.music",
  title: "Till I Collapse",
  artist: "Eminem",
  playing: true,
  volume: 7,
  volumeMax: 15,
  queueKnown: true,
  queue: [{ id: 11, title: "Lose Yourself", artist: "Eminem" }],
};
window.Capacitor = {
  isNativePlatform: () => true,
  Plugins: {
    MusicBridge: {
      state: async () => JSON.parse(JSON.stringify(window.__musicState)),
      control: async (args) => { window.__musicCalls.push(args); },
      openAccess: async () => { window.__musicCalls.push({ action: "access" }); },
      openPlayer: async () => { window.__musicCalls.push({ action: "open" }); },
    },
  },
};
"""


def open_with_music(browser_context, url, state_patch=""):
    page = browser_context.new_page()
    errors = collect_errors(page)
    page.add_init_script(MUSIC_STUB + state_patch)
    page.goto(url, wait_until="domcontentloaded")
    return page, errors


def last_call(page):
    page.wait_for_function("() => window.__musicCalls.length > 0")
    return page.evaluate("() => window.__musicCalls.at(-1)")


def test_music_bar_controls_player_from_any_tab(local_server, browser_context):
    page, errors = open_with_music(browser_context, local_server)
    bar = page.locator("#musicBar")
    expect(bar).to_be_visible()
    expect(bar.locator(".music-now strong")).to_have_text("Till I Collapse")
    expect(bar.locator(".music-now span")).to_have_text("Eminem")

    page.click('.bottom-nav-btn[data-target="calendar"]')
    expect(bar).to_be_visible()

    for action in ["next", "prev", "volumeUp", "volumeDown"]:
        page.evaluate("() => { window.__musicCalls = []; }")
        bar.locator(f'[data-music="{action}"]').click()
        assert last_call(page) == {"action": action}

    page.evaluate("() => { window.__musicCalls = []; }")
    bar.locator('[data-music="toggle"]').click()
    assert last_call(page) == {"action": "toggle"}
    expect(bar.locator('[data-music="toggle"]')).to_have_attribute("aria-label", "Играть")

    bar.locator('[data-music="expand"]').click()
    expect(bar.locator(".music-queue")).to_contain_text("Lose Yourself")
    volume = bar.locator("[data-music-volume]")
    expect(volume).to_have_value("7")
    page.evaluate("() => { window.__musicCalls = []; }")
    volume.fill("12")
    assert last_call(page) == {"action": "volumeSet", "value": 12}

    page.evaluate("() => { window.__musicCalls = []; }")
    bar.locator('.music-queue [data-music="queue"]').click()
    assert last_call(page) == {"action": "queue", "id": 11}

    if os.environ.get("MUSIC_SCREENSHOT"):
        bar.locator('[data-music="expand"]').click()
        page.click('.bottom-nav-btn[data-target="workout"]')
        page.screenshot(path=os.environ["MUSIC_SCREENSHOT"], clip={"x": 0, "y": 0, "width": 390, "height": 260})
    assert not errors


def test_music_bar_stays_out_of_the_way_without_player(local_server, browser_context):
    page, _ = open_with_music(
        browser_context, local_server, "window.__musicState = { granted: false, active: false };"
    )
    page.wait_for_timeout(500)
    expect(page.locator("#musicBar")).to_be_hidden()
    assert page.evaluate("() => document.documentElement.classList.contains('has-music-bar')") is False
