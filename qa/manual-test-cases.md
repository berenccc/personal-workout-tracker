# Trainy manual checklist

## Scope
- URL (local): `http://127.0.0.1:4173/training-tracker.html`
- URL (production smoke): `https://berenccc.github.io/personal-workout-tracker/training-tracker.html`
- Goal: cover core user flows for the personal app without login.

## Manual scenarios
1. App opens immediately: workout screen is visible, no auth overlay.
2. Workout flow: start workout, add exercise, mark set, finish session.
3. Tab navigation: workout, calendar, AI, cabinet, analytics.
4. AI flow: send a question, receive answer, no daily-limit or login error text.
5. Cabinet/history: finished workout appears in history list.
6. AI plan confirmation: after finishing a session the chat offers the next plan; the main screen stays empty until «Принять план», and «Отклонить» leaves it empty.
7. Band session chart: drag across the pulse chart — time, bpm, zone and exercise appear; tapping an exercise block shows its average and max pulse.
8. Offline behavior: cached shell loads and the app stays usable.
9. Production smoke: main html, manifest, service worker, index return 200.

## Environment limitations
- Cloud sync stays optional and only runs if an old session is already on the device.
- No write operations were executed against production user data.
