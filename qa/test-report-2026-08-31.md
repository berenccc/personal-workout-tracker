# Trainy QA report (2026-08-31)

## Automated testing
- Command: `python -m pytest`
- Result: `5 passed in 5.56s`
- Suite file: `tests/e2e/test_trainy_regression.py`
- Covered:
  - auth gate + simulated login/logout state transitions
  - workout finish flow and synced finish notice
  - AI chat happy path with stubbed backend and no `Дневной лимит AI исчерпан`
  - calendar + analytics tab rendering
  - production smoke page-load check without auth

## Manual testing probes
- Local offline probe:
  - `offline_shell_loaded = True`
  - `auth_gate_visible = True`
- Draft restore probe:
  - `draft_restore_pageerror = ""` (no runtime pageerror reproduced in this run)

## Production smoke (safe)
- `https://berenccc.github.io/personal-workout-tracker/training-tracker.html` -> 200
- `https://berenccc.github.io/personal-workout-tracker/manifest.webmanifest?v=112` -> 200
- `https://berenccc.github.io/personal-workout-tracker/sw.js?v=112` -> 200
- `https://berenccc.github.io/personal-workout-tracker/index.html` -> 200
- No OTP login, workout creation, or AI paid usage executed on production.

## Notes
- This run intentionally used local cloud/AI stubs to avoid touching production account data.
- Full end-to-end OTP + real Supabase sync/AI validation needs dedicated test credentials and user-approved production test window.
