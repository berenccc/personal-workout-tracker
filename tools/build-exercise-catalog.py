# Generates exercise-catalog.js (app format) from data/exercise-catalog.json.
# Run from repo root: python tools/build-exercise-catalog.py
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
catalog = json.loads((ROOT / "data" / "exercise-catalog.json").read_text(encoding="utf-8"))

UNIT_RU = {
    "kg": "кг",
    "kg_hand": "кг/рука",
    "kg_counter": "кг противовес",
    "min": "мин",
    "sec": "сек/повт",
    "reps": "повторы",
}

# Явные исключения из правила "группа по первой основной мышце".
GROUP_OVERRIDES = {
    "box-jump": "Плиометрика",
    "kettlebell-swing": "Задняя цепь",
    "overhead-plate": "Кор",
    "farmer-carry": "Функционал",
    "burpee": "Функционал",
    "sled-push": "Функционал",
    "battle-ropes": "Функционал",
    "mountain-climbers": "Функционал",
}

MUSCLE_GROUP = {
    "quads": "Ноги", "glutes": "Ноги", "adductors": "Ноги", "abductors": "Ноги",
    "calves": "Икры",
    "lower_back": "Задняя цепь",
    "chest": "Грудь",
    "lats": "Спина", "upper_back": "Спина", "traps": "Спина",
    "shoulders": "Плечи", "rear_delts": "Плечи",
    "biceps": "Руки", "triceps": "Руки", "forearms": "Руки",
    "core": "Кор", "obliques": "Кор", "hip_flexors": "Кор",
    "full_body": "Функционал",
}


def group_for(exercise):
    if exercise["id"] in GROUP_OVERRIDES:
        return GROUP_OVERRIDES[exercise["id"]]
    if exercise["type"] == "cardio":
        return "Кардио"
    first = exercise["primary"][0]
    if first == "hamstrings":
        return "Ноги" if exercise["equipment"] == "machine" else "Задняя цепь"
    return MUSCLE_GROUP.get(first, "Другое")


app_exercises = []
for exercise in catalog["exercises"]:
    entry = {
        "id": exercise["id"],
        "name": exercise["name"]["ru"],
        "nameEn": exercise["name"]["en"],
        "group": group_for(exercise),
        "unit": UNIT_RU[exercise["unit"]],
        "step": exercise["step"],
        "defaultSets": exercise["defaultSets"],
        "type": exercise["type"],
        "equipment": exercise["equipment"],
        "primary": exercise["primary"],
        "level": exercise["level"],
    }
    if exercise.get("lowerIsBetter"):
        entry["lowerIsBetter"] = True
    if exercise.get("cardio"):
        entry["cardio"] = True
    if exercise["unit"] in ("reps", "sec"):
        entry["bodyweight"] = True
    app_exercises.append(entry)

lines = ",\n".join(
    "    " + json.dumps(entry, ensure_ascii=False, separators=(", ", ": "))
    for entry in app_exercises
)
aliases = json.dumps(catalog["aliases"], ensure_ascii=False, separators=(", ", ": "))

out = (
    "// Автогенерация: python tools/build-exercise-catalog.py (источник data/exercise-catalog.json). Не править руками.\n"
    "window.exerciseCatalog = {\n"
    f"  version: {catalog['version']},\n"
    f"  aliases: {aliases},\n"
    "  exercises: [\n"
    f"{lines}\n"
    "  ],\n"
    "};\n"
)
(ROOT / "exercise-catalog.js").write_text(out, encoding="utf-8")
print(f"exercise-catalog.js: {len(app_exercises)} exercises")
from collections import Counter
print(dict(Counter(entry["group"] for entry in app_exercises)))
