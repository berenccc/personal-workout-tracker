import json
from datetime import date

from playwright.sync_api import Page, expect


PLAN_KEY = "training-tracker-ai-plan-v1"
PENDING_KEY = "training-tracker-ai-pending-plan-v1"


def seeded_plan() -> str:
    return json.dumps(
        {
            "version": 1,
            "savedAt": 1,
            "planDate": date.today().isoformat(),
            "notes": "qa",
            "exercises": [
                {"exerciseId": "bench", "sets": [{"weight": 60, "reps": 8, "rpe": 7}]},
                {"exerciseId": "lat-pulldown", "sets": [{"weight": 50, "reps": 10, "rpe": 7}]},
                {"exerciseId": "leg-press", "sets": [{"weight": 140, "reps": 10, "rpe": 7}]},
            ],
        },
        ensure_ascii=False,
    )


def prepare_tool_stub(page: Page, tool_name: str, arguments: dict) -> None:
    call = json.dumps(
        {
            "id": "call-1",
            "type": "function",
            "function": {
                "name": tool_name,
                "arguments": json.dumps(arguments, ensure_ascii=False),
            },
        },
        ensure_ascii=False,
    )
    page.route(
        "**/cloud.js*",
        lambda route: route.fulfill(
            status=200,
            content_type="application/javascript",
            body=f"""
            window.cloudSync = {{
              pushWorkout: async () => false,
              deleteWorkout: async () => true,
              fullSync: async () => true,
              callAi: async (messages) => {{
                const answered = (messages || []).some((message) => message.role === "tool");
                if (answered) return {{ choices: [{{ message: {{ content: "Готово." }} }}] }};
                return {{ choices: [{{ message: {{ tool_calls: [{call}] }} }}] }};
              }},
              isAuthenticated: () => false,
              isReady: () => true,
            }};
            """,
        ),
    )


def open_plan(page: Page, url: str, tool_name: str, arguments: dict) -> None:
    prepare_tool_stub(page, tool_name, arguments)
    page.add_init_script(f"localStorage.setItem({json.dumps(PLAN_KEY)}, {json.dumps(seeded_plan())});")
    page.goto(url, wait_until="domcontentloaded")
    expect(page.locator("#selectedExercises .exercise-card")).to_have_count(3)


def ask(page: Page, text: str) -> None:
    page.click('.bottom-nav-btn[data-target="ai"]')
    page.fill("#aiChatInput", text)
    page.click("#aiChatSendButton")
    expect(page.locator(".ai-msg-bot").last).to_contain_text("Готово")


def titles(page: Page) -> list[str]:
    return page.locator("#selectedExercises .exercise-card h3").all_text_contents()


def test_ai_replaces_exercise_and_its_sets(local_server, browser_context):
    page = browser_context.new_page()
    open_plan(page, local_server, "update_exercise_in_plan", {
        "exerciseId": "bench",
        "newExerciseId": "squat",
        "sets": [{"weight": 40, "reps": 12, "rpe": 6}],
    })

    ask(page, "Замени жим лёжа на присед")

    assert titles(page) == ["Присед со штангой", "Тяга верхнего блока / тяга сверху", "Жим ногами без наклона"]
    squat = page.locator("#selectedExercises .exercise-card", has_text="Присед со штангой")
    expect(squat.locator('input[data-field="reps"]')).to_have_value("12")
    expect(squat.locator('input[data-field="weight"]')).to_have_value("40")


def test_ai_removes_exercise(local_server, browser_context):
    page = browser_context.new_page()
    open_plan(page, local_server, "remove_exercise_from_plan", {"position": 2})

    ask(page, "Убери тягу")

    assert titles(page) == ["Жим штанги лёжа", "Жим ногами без наклона"]


def test_ai_removes_exercise_from_pending_proposal(local_server, browser_context):
    page = browser_context.new_page()
    prepare_tool_stub(page, "remove_exercise_from_plan", {"exerciseId": "lat-pulldown"})
    proposal = json.loads(seeded_plan())
    proposal.pop("planDate")
    page.add_init_script(
        f"localStorage.setItem({json.dumps(PENDING_KEY)}, {json.dumps(json.dumps(proposal, ensure_ascii=False))});"
    )
    page.goto(local_server, wait_until="domcontentloaded")

    ask(page, "Убери тягу")

    offer = page.locator(".ai-plan-offer-list li")
    expect(offer).to_have_count(2)
    expect(page.locator(".ai-plan-offer-list")).not_to_contain_text("Тяга верхнего блока")
    stored = json.loads(page.evaluate(f"() => localStorage.getItem({json.dumps(PENDING_KEY)})"))
    assert [item["exerciseId"] for item in stored["exercises"]] == ["bench", "leg-press"]


def test_ai_reorders_plan_and_keeps_done_sets(local_server, browser_context):
    page = browser_context.new_page()
    open_plan(page, local_server, "reorder_plan", {
        "exerciseIds": ["leg-press", "bench", "lat-pulldown"],
    })

    page.click("#startWorkoutButton")
    page.evaluate(
        """
        () => {
          const card = [...document.querySelectorAll("#selectedExercises .exercise-card")]
            .find((node) => node.textContent.includes("Жим штанги лёжа"));
          const input = card.querySelector('input[data-field="done"]');
          input.checked = true;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        """
    )
    bench = page.locator("#selectedExercises .exercise-card", has_text="Жим штанги лёжа")

    ask(page, "Поставь жим ногами первым")

    assert titles(page) == ["Жим ногами без наклона", "Жим штанги лёжа", "Тяга верхнего блока / тяга сверху"]
    expect(bench.locator('input[data-field="done"]')).to_be_checked()
    leg = page.locator("#selectedExercises .exercise-card", has_text="Жим ногами без наклона")
    expect(leg.locator('input[data-field="done"]')).not_to_be_checked()


def test_bad_reorder_leaves_plan_unchanged(local_server, browser_context):
    page = browser_context.new_page()
    open_plan(page, local_server, "reorder_plan", {"exerciseIds": ["bench", "squat"]})

    ask(page, "Поменяй порядок")

    assert titles(page) == ["Жим штанги лёжа", "Тяга верхнего блока / тяга сверху", "Жим ногами без наклона"]
