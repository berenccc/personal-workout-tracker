from test_trainy_regression import prepare_local_stub


def test_rest_quote_appears_on_the_day_not_before(local_server, browser_context):
    page = browser_context.new_page()
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")

    result = page.evaluate(
        """() => ({
          today: widgetRestCopy("2026-09-29", "2026-09-29"),
          future: widgetRestCopy("2026-09-30", "2026-09-29"),
          again: restQuote("2026-09-29"),
        })"""
    )

    assert result["today"]["quote"]
    assert result["today"]["meta"] == "Тренировок нет — отдыхай."
    assert result["future"]["quote"] == ""
    assert result["future"]["meta"] == "На этот день тренировки нет."
    assert result["again"] == result["today"]["quote"]


def test_widget_day_chrome_and_verdict(local_server, browser_context):
    page = browser_context.new_page()
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")

    result = page.evaluate(
        """() => {
          const easy = {
            notes: "",
            afterNotes: "",
            exercises: [{ exerciseId: "squat", sets: [{ weight: 40, reps: 10, rpe: 6, done: true }] }],
          };
          const hard = {
            notes: "",
            afterNotes: "",
            exercises: [{ exerciseId: "squat", sets: [{ weight: 80, reps: 6, rpe: 9, done: true }] }],
          };
          const sore = {
            notes: "",
            afterNotes: "колено потянуло",
            exercises: [{ exerciseId: "squat", sets: [{ weight: 40, reps: 10, rpe: 7, done: true }] }],
          };
          return {
            easy: widgetSessionVerdict(easy),
            hard: widgetSessionVerdict(hard),
            sore: widgetSessionVerdict(sore),
            done: widgetDayChrome("2026-09-28", "2026-09-30", { id: "w" }, 0, false),
            today: widgetDayChrome("2026-09-30", "2026-09-30", null, 4, false),
            rest: widgetDayChrome("2026-09-29", "2026-09-30", null, 0, false),
            future: widgetDayChrome("2026-10-01", "2026-09-30", null, 0, false),
            futurePlan: widgetDayChrome("2026-10-02", "2026-09-30", null, 3, false),
          };
        }"""
    )

    assert "Молодец" in result["easy"] or "Запас" in result["easy"]
    assert "дожал" in result["hard"]
    assert "тело" in result["sore"]
    assert result["done"]["button"] == "result"
    assert result["done"]["buttonAction"] == "day:2026-09-28"
    assert result["today"]["button"] == "pair"
    assert result["rest"]["button"] == "open"
    assert result["rest"]["buttonAction"] == "day:2026-09-29"
    assert result["future"]["button"] == "open"
    assert result["future"]["buttonAction"] == "open"
    assert result["futurePlan"]["buttonAction"] == "plan:2026-10-02"
