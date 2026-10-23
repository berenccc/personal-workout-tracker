"""Поднимает версию приложения во всех местах, где она используется для сброса кэша.

Использование: python tools/bump-version.py          # +1 к текущей
               python tools/bump-version.py 180      # конкретная версия
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

RULES = {
    "training-tracker.html": [
        (r"\?v=\d+", "?v={v}"),
        (r'version-badge">v\d+<', 'version-badge">v{v}<'),
        (r'const APP_VERSION = "v\d+"', 'const APP_VERSION = "v{v}"'),
    ],
    "sw.js": [
        (r"\?v=\d+", "?v={v}"),
        (r"training-tracker-v\d+", "training-tracker-v{v}"),
    ],
    "index.html": [(r"\?v=\d+", "?v={v}")],
    "cache-reset.html": [(r"\?v=\d+", "?v={v}")],
    "manifest.webmanifest": [(r"\?v=\d+", "?v={v}")],
    "capacitor.config.json": [(r'("appName": "[^"]*?v)\d+"', r'\g<1>{v}"')],
}


def current_version():
    html = (ROOT / "training-tracker.html").read_text(encoding="utf-8")
    return int(re.search(r'const APP_VERSION = "v(\d+)"', html).group(1))


def main():
    version = int(sys.argv[1]) if len(sys.argv) > 1 else current_version() + 1
    for name, rules in RULES.items():
        path = ROOT / name
        with path.open(encoding="utf-8", newline="") as file:
            text = file.read()
        for pattern, replacement in rules:
            text, count = re.subn(pattern, replacement.replace("{v}", str(version)), text)
            if not count:
                sys.exit(f"{name}: не найдено {pattern!r}")
        with path.open("w", encoding="utf-8", newline="") as file:
            file.write(text)
    print(f"v{version}")


if __name__ == "__main__":
    main()
