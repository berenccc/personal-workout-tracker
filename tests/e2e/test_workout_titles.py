import pytest
from playwright.sync_api import expect

from test_trainy_regression import prepare_local_stub


def item(exercise_id: str, sets: int = 3) -> dict:
    return {"exerciseId": exercise_id, "sets": [{"weight": 10, "reps": 10}] * sets}


CASES = [
    ([item("lat-pulldown"), item("leg-press")], "Спина и ноги"),
    ([item("leg-press"), item("lat-pulldown")], "Спина и ноги"),
    ([item("bench"), item("lat-pulldown"), item("leg-press")], "Всё тело"),
    ([item("bench"), item("lat-pulldown"), item("overhead-press")], "Верх тела"),
    ([item("leg-press", 4), item("plank", 3)], "Ноги"),
    ([item("plank")], "Кор"),
    ([item("bench", 5), item("lat-pulldown", 1)], "Грудь"),
    ([], "Тренировка"),
]


@pytest.mark.parametrize("items,expected", CASES)
def test_training_title_is_plain_words(local_server, browser_context, items, expected):
    page = browser_context.new_page()
    prepare_local_stub(page)
    page.goto(local_server, wait_until="domcontentloaded")
    expect(page.locator("#workoutTitle")).to_be_attached()

    title = page.evaluate("(items) => trainingTitle(items)", items)

    assert title == expected
    assert "+" not in title
