import json
from datetime import datetime, timedelta

from playwright.sync_api import Page, expect

from test_trainy_regression import prepare_local_stub


def seeded_state() -> str:
    start = datetime(2026, 9, 20, 18, 0, 0)
    series = []
    for index in range(180):
        # Пила: пульс поднимается на подходе и падает в паузе.
        phase = index % 12
        bpm = 110 + (phase * 6 if phase < 6 else (11 - phase) * 6)
        series.append(
            {
                "t": (start + timedelta(seconds=index * 20)).isoformat() + "Z",
                "bpm": bpm,
            }
        )

    def sets(count: int) -> list:
        return [{"weight": 20, "reps": 10, "rpe": 7, "done": True, "mark": "normal"} for _ in range(count)]

    workout = {
        "id": "qa-hr",
        "date": "2026-09-20",
        "durationMinutes": 60,
        "readiness": "good",
        "notes": "",
        "afterNotes": "qa",
        "exercises": [
            {"exerciseId": "bench-press", "sets": sets(4)},
            {"exerciseId": "lat-pulldown", "sets": sets(3)},
            {"exerciseId": "leg-press", "sets": sets(5)},
        ],
        "wearable": {
            "hrAvg": 135,
            "hrMin": 110,
            "hrMax": 176,
            "hrMaxUsed": 190,
            "calories": 620,
            "caloriesSource": "band",
            "hrSeries": series,
            "zoneShares": {"warmup": 10, "fat": 30, "aerobic": 40, "anaerobic": 15, "peak": 5},
            "sessionTypeLabel": "Аэробная",
        },
    }
    return json.dumps({"version": 3, "workouts": [workout]}, ensure_ascii=False)


def open_band_page(page: Page, url: str) -> None:
    prepare_local_stub(page)
    state = seeded_state()
    page.add_init_script(f"localStorage.setItem('training-tracker-v3', {json.dumps(state)});")
    page.goto(url, wait_until="domcontentloaded")
    page.click('.bottom-nav-btn[data-target="band"]')


def test_hr_timeline_renders_with_exercise_blocks(local_server, browser_context):
    page = browser_context.new_page()
    errors = []
    # Playwright блокирует service worker, поэтому registration.update() падает — это не наш баг.
    page.on(
        "pageerror",
        lambda err: errors.append(str(err)) if "'update'" not in str(err) else None,
    )
    open_band_page(page, local_server)

    chart = page.locator("#bandLastSession [data-hr-chart]")
    expect(chart).to_be_visible()
    expect(chart.locator("[data-hr-seg]")).to_have_count(3)
    expect(chart.locator("[data-hr-block]")).to_have_count(3)
    expect(chart.locator("[data-hr-readout]")).to_contain_text("средний 135")
    assert not errors


def test_scrub_shows_pulse_zone_and_exercise(local_server, browser_context):
    page = browser_context.new_page()
    open_band_page(page, local_server)

    plot = page.locator("#bandLastSession [data-hr-plot]")
    box = plot.bounding_box()
    page.mouse.move(box["x"] + box["width"] * 0.5, box["y"] + box["height"] / 2)
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] * 0.55, box["y"] + box["height"] / 2)

    readout = page.locator("#bandLastSession [data-hr-readout]")
    expect(readout).to_contain_text("уд")
    expect(page.locator("#bandLastSession [data-hr-seg][data-active='1']")).to_have_count(1)
    page.mouse.up()


def test_exercise_block_tap_shows_its_stats(local_server, browser_context):
    page = browser_context.new_page()
    open_band_page(page, local_server)

    page.click("#bandLastSession [data-hr-block='1']")
    readout = page.locator("#bandLastSession [data-hr-readout]")
    expect(readout).to_contain_text("2.")
    expect(readout).to_contain_text("пульс")
    expect(page.locator("#bandLastSession [data-hr-block='1'][data-active='1']")).to_have_count(1)
