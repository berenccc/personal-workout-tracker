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
