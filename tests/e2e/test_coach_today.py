from test_trainy_regression import prepare_local_stub


def coach_text(page, after_notes):
    return page.evaluate(
        """(afterNotes) => {
          const bench = exercises.find((item) => /жим штанги лёжа/i.test(item.name));
          const pull = exercises.find((item) => /тяга верхнего блока/i.test(item.name));
          const today = document.querySelector("#dateInput").value;
          state.workouts = [{
            id: "old-pull",
            date: "2026-09-20",
            sessionEffort: "normal",
            afterNotes,
            exercises: [{
              exerciseId: pull.id,
              sets: [{ weight: 33.5, reps: 10, rpe: 7, done: true, mark: "normal" }],
            }],
          }];
          selected = [{
            uid: "today-bench",
            exerciseId: bench.id,
            sets: [{ weight: 60, reps: 8, rpe: "", done: false, mark: "normal" }],
          }];
          editingPlanIso = today;
          renderCoach();
          return document.querySelector("#coachBox").innerText;
        }""",
        after_notes,
    )


def test_coach_follows_today_and_skips_weight_hints(local_server, browser_context):
    page = browser_context.new_page()
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")

    pump = coach_text(page, "В тягах подзабивались бицепсы. На жим ногами на этих весах вообще не проблема.").lower()
    assert "подсказки по весам" not in pump
    assert "календарю" not in pump
    assert "грудь" in pump
    assert "спокойнее" not in pump
    assert "не влияет" in pump

    shoulder = coach_text(page, "Плечо потянуло на жиме.").lower()
    assert "спокойнее" in shoulder
    assert "плеч" in shoulder
    assert "подсказки по весам" not in shoulder

    knee = coach_text(page, "Колено потянуло, на жиме ног было тяжело.").lower()
    assert "не переносится" in knee
    assert "спокойнее" not in knee
