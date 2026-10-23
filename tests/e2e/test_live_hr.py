from test_trainy_regression import add_plan_exercise, first_exercise_value, prepare_local_stub


def test_live_hr_skips_old_peak_and_lone_spike(local_server, browser_context):
    page = browser_context.new_page()
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")

    result = page.evaluate(
        """() => {
          const now = Date.now();
          const iso = (age) => new Date(now - age).toISOString();
          const resting = TrainyWearable.pickLiveReading([
            { bpm: 140, time: iso(120000) },
            { bpm: 92, time: iso(8000) },
          ], now);
          const spike = TrainyWearable.pickLiveReading([
            { bpm: 90, time: iso(15000) },
            { bpm: 94, time: iso(10000) },
            { bpm: 91, time: iso(5000) },
            { bpm: 140, time: iso(1000) },
          ], now);
          const fresh = TrainyWearable.pickLiveReading([
            { bpm: 96, time: iso(3000) },
          ], now);
          const ancient = TrainyWearable.pickLiveReading([
            { bpm: 140, time: iso(180000) },
          ], now);
          return { resting, spike, fresh, ancient };
        }"""
    )
    assert result["resting"]["bpm"] == 92
    assert result["resting"]["stale"] is False
    assert result["spike"]["bpm"] <= 100
    assert result["fresh"]["bpm"] == 96
    assert result["ancient"] is None


def test_last_known_hr_has_age_and_no_placeholder(local_server, browser_context):
    page = browser_context.new_page()
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")

    known = page.evaluate(
        """() => {
          const now = Date.now();
          const iso = (age) => new Date(now - age).toISOString();
          return {
            recent: TrainyWearable.lastKnownReading([
              { bpm: 110, time: iso(9 * 60000) },
              { bpm: 96, time: iso(7 * 60000) },
            ], now),
            old: TrainyWearable.lastKnownReading([{ bpm: 96, time: iso(40 * 60000) }], now),
          };
        }"""
    )
    assert known["recent"]["bpm"] == 96
    assert known["recent"]["stale"] is True
    assert known["old"] is None

    add_plan_exercise(page, first_exercise_value(page))
    page.click("#startWorkoutButton")

    readout = page.locator("#setHrReadout")
    assert readout.is_hidden()
    assert "Жду" not in (readout.text_content() or "")

    page.evaluate("() => { liveBandHr = { bpm: 96, at: Date.now() - 7 * 60000 }; paintSetHeart(); }")
    assert readout.is_visible()
    assert readout.text_content() == "♥ 96 · 7 мин назад"
