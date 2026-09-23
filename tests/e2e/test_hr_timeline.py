import json
from datetime import datetime, timedelta

from playwright.sync_api import Page, expect

from test_trainy_regression import prepare_local_stub

START = datetime(2026, 9, 20, 18, 0, 0)


def epoch_ms(moment: datetime) -> int:
    return int((moment - datetime(1970, 1, 1)).total_seconds() * 1000)


def seeded_state(marked: bool = True, raw_count: int | None = None) -> str:
    series = []
    for index in range(180):
        # Пила: пульс поднимается на подходе и падает в паузе.
        phase = index % 12
        bpm = 110 + (phase * 6 if phase < 6 else (11 - phase) * 6)
        series.append(
            {
                "t": (START + timedelta(seconds=index * 20)).isoformat() + "Z",
                "bpm": bpm,
            }
        )

    counter = {"value": 0}

    def sets(count: int) -> list:
        rows = []
        for _ in range(count):
            counter["value"] += 1
            row = {"weight": 20, "reps": 10, "rpe": 7, "done": True, "mark": "normal"}
            if marked:
                row["doneAt"] = epoch_ms(START + timedelta(minutes=4 * counter["value"]))
            rows.append(row)
        return rows

    wearable = {
        "hrAvg": 135,
        "hrMin": 110,
        "hrMax": 176,
        "hrMaxUsed": 190,
        "calories": 620,
        "caloriesSource": "band",
        "hrSeries": series,
        "zones": {"warmup": 360, "fat": 1080, "aerobic": 1440, "anaerobic": 540, "peak": 180},
        "zoneShares": {"warmup": 10, "fat": 30, "aerobic": 40, "anaerobic": 15, "peak": 5},
        "sessionTypeLabel": "Аэробная",
    }
    if raw_count is not None:
        wearable["hrRawCount"] = raw_count

    workout = {
        "id": "qa-hr",
        "date": "2026-09-20",
        "startedAt": START.isoformat() + "Z",
        "durationMinutes": 60,
        "readiness": "good",
        "notes": "",
        "afterNotes": "qa",
        "exercises": [
            {"exerciseId": "bench-press", "sets": sets(4)},
            {"exerciseId": "lat-pulldown", "sets": sets(3)},
            {"exerciseId": "leg-press", "sets": sets(5)},
        ],
        "wearable": wearable,
    }
    return json.dumps({"version": 3, "workouts": [workout]}, ensure_ascii=False)


def band_snapshot(**overrides) -> str:
    snapshot = {
        "available": True,
        "authorized": True,
        "updatedAt": "2026-09-20T20:00:00Z",
        "sleepMinutes": 441,
        "sleepDeepMinutes": 142,
        "sleepLightMinutes": 176,
        "sleepRemMinutes": 123,
        "todayCalories": 110,
        "todayTotalCalories": 1675,
        "todaySteps": 493,
        "sourceLabel": "Mi Band",
    }
    snapshot.update(overrides)
    return json.dumps(snapshot, ensure_ascii=False)


def open_band_page(page: Page, url: str, state: str | None = None, snapshot: str | None = None) -> None:
    prepare_local_stub(page)
    script = f"localStorage.setItem('training-tracker-v3', {json.dumps(state or seeded_state())});"
    if snapshot:
        script += f"localStorage.setItem('training-tracker-band-v1', {json.dumps(snapshot)});"
    page.add_init_script(script)
    page.goto(url, wait_until="domcontentloaded")
    page.click('.bottom-nav-btn[data-target="band"]')


def collect_errors(page: Page) -> list:
    errors = []
    # Playwright блокирует service worker, поэтому registration.update() падает — это не наш баг.
    page.on(
        "pageerror",
        lambda err: errors.append(str(err)) if "'update'" not in str(err) else None,
    )
    return errors


def test_hr_timeline_renders_with_exercise_blocks(local_server, browser_context):
    page = browser_context.new_page()
    errors = collect_errors(page)
    open_band_page(page, local_server)

    chart = page.locator("#bandLastSession [data-hr-chart]")
    expect(chart).to_be_visible()
    expect(chart.locator("[data-hr-seg]")).to_have_count(3)
    expect(chart.locator("[data-hr-block]")).to_have_count(3)
    expect(chart.locator("[data-hr-readout]")).to_contain_text("средний 135")
    expect(chart.locator("polyline").first).to_be_attached()
    expect(page.locator("#bandLastSession .band-zone-row")).to_have_count(5)
    expect(page.locator("#bandLastSession .band-big")).to_contain_text("620")
    assert not errors


def test_unmarked_sets_show_no_guessed_blocks(local_server, browser_context):
    page = browser_context.new_page()
    open_band_page(page, local_server, state=seeded_state(marked=False))

    chart = page.locator("#bandLastSession [data-hr-chart]")
    expect(chart).to_be_visible()
    expect(chart.locator("[data-hr-block]")).to_have_count(0)


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


def test_sparse_pulse_hides_rest_analysis(local_server, browser_context):
    page = browser_context.new_page()
    open_band_page(page, local_server, state=seeded_state(raw_count=60))

    expect(page.locator("#bandLastSession .band-recovery")).to_have_count(0)
    expect(page.locator("#bandLastSession")).to_contain_text("Разбор отдыха между подходами скрыт")


def test_today_rings_and_sleep_stages(local_server, browser_context):
    page = browser_context.new_page()
    errors = collect_errors(page)
    open_band_page(page, local_server, snapshot=band_snapshot())

    rings = page.locator("#wearableStats .band-ring")
    expect(rings).to_have_count(3)
    expect(rings.nth(0)).to_contain_text("7ч 21м")
    expect(rings.nth(2)).to_contain_text("493")
    expect(page.locator("#bandSleepCard .band-legend > div")).to_have_count(3)
    expect(page.locator("#bandReadiness")).to_be_visible()
    assert not errors


def test_denied_pulse_permission_is_explained(local_server, browser_context):
    page = browser_context.new_page()
    open_band_page(page, local_server, snapshot=band_snapshot(permissions={"heartRate": False}, hrCount24h=0))

    card = page.locator("#bandHeartCard")
    expect(card).to_be_visible()
    expect(card).to_contain_text("нет доступа")
    expect(card.locator("[data-band-action='grant']")).to_be_visible()


def test_granted_but_empty_pulse_points_to_mi_fitness(local_server, browser_context):
    page = browser_context.new_page()
    open_band_page(page, local_server, snapshot=band_snapshot(permissions={"heartRate": True}, hrCount24h=0))

    card = page.locator("#bandHeartCard")
    expect(card).to_contain_text("0 замеров")
    expect(card).to_contain_text("Mi Fitness")


def test_day_pulse_card_with_samples(local_server, browser_context):
    day = [
        {"t": (START + timedelta(minutes=10 * i)).isoformat() + "Z", "bpm": 60 + (i % 7) * 5}
        for i in range(30)
    ]
    snapshot = band_snapshot(
        permissions={"heartRate": True},
        hrCount24h=300,
        lastHr=72,
        lastHrAt="2026-09-20T19:55:00Z",
        hrDayMin=58,
        hrDayAvg=74,
        hrDayMax=131,
        hrDaySeries=day,
    )
    page = browser_context.new_page()
    open_band_page(page, local_server, snapshot=snapshot)

    card = page.locator("#bandHeartCard")
    expect(card.locator(".band-big")).to_contain_text("72")
    expect(card.locator(".band-day-hr")).to_be_attached()
    expect(card).to_contain_text("131")
