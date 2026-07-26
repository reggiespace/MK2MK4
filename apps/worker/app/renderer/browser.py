"""Headless-Chromium slide rendering.

The web app owns the one slide renderer; this module drives a browser over it
and captures the result at the template's real canvas size. There is
deliberately no second layout engine here — if a slide looks wrong, the fix
belongs in the React component, not in this file.
"""
from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Iterator

from playwright.sync_api import Browser, sync_playwright

log = logging.getLogger("worker.browser")

# The element the render page wraps its canvas in.
CANVAS_SELECTOR = "#slide-canvas"

# Generous, but bounded: a slide that hasn't painted in 30s is a real failure.
NAV_TIMEOUT_MS = 30_000


@contextmanager
def _browser() -> Iterator[Browser]:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox", "--font-render-hinting=none"])
        try:
            yield browser
        finally:
            browser.close()


def render_slides(
    *,
    base_url: str,
    post_id: str,
    token: str,
    slide_count: int,
    width: int,
    height: int,
) -> list[bytes]:
    """Screenshot every slide of a post, in order, as PNG bytes."""
    shots: list[bytes] = []

    with _browser() as browser:
        # One context for all slides — fonts stay warm between navigations.
        context = browser.new_context(
            viewport={"width": width, "height": height},
            device_scale_factor=1,
        )
        page = context.new_page()
        page.set_default_timeout(NAV_TIMEOUT_MS)

        for index in range(slide_count):
            url = f"{base_url}?post={post_id}&i={index}&token={token}"
            page.goto(url, wait_until="networkidle")

            # Webfonts must be in before the shot or type metrics shift.
            page.evaluate("() => document.fonts.ready")

            element = page.query_selector(CANVAS_SELECTOR)
            if element is None:
                raise RuntimeError(f"slide {index}: {CANVAS_SELECTOR} not found at {url}")

            shots.append(element.screenshot(type="png"))
            log.info("rendered slide %d/%d", index + 1, slide_count)

        context.close()

    return shots
