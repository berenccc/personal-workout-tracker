import socket
import subprocess
import time
from pathlib import Path

import pytest
from playwright.sync_api import Playwright, sync_playwright


ROOT_DIR = Path(__file__).resolve().parents[2]


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _wait_for_port(host: str, port: int, timeout_sec: float = 15.0) -> None:
    start = time.time()
    while time.time() - start < timeout_sec:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.5)
            if sock.connect_ex((host, port)) == 0:
                return
        time.sleep(0.2)
    raise RuntimeError(f"Timed out waiting for {host}:{port}")


@pytest.fixture(scope="session")
def local_server():
    port = _free_port()
    process = subprocess.Popen(
        ["python", "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=ROOT_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        _wait_for_port("127.0.0.1", port)
        yield f"http://127.0.0.1:{port}/training-tracker.html"
    finally:
        process.terminate()
        process.wait(timeout=10)


@pytest.fixture(scope="session")
def playwright_instance() -> Playwright:
    with sync_playwright() as playwright:
        yield playwright


@pytest.fixture()
def browser_context(playwright_instance: Playwright):
    browser = playwright_instance.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 390, "height": 844},
        service_workers="block",
    )
    yield context
    context.close()
    browser.close()
