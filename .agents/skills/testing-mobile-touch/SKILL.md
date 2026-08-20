---
name: testing-mobile-touch
description: How to runtime-test the billboard remixer (and similar zero-dependency canvas static sites) on emulated phones — coarse-pointer media emulation, raw CDP touch events, canvas-pixel assertions, bottom-sheet control tapping, and export/download dimension checks.
---

# Touch/mobile runtime testing for the billboard remixer

## Serving and connecting
- Zero dependencies. Serve from the repo root: `python3 -m http.server 8123`, open `http://localhost:8123/`.
- Drive an already-running Chrome over CDP (`http://localhost:29229`) with Playwright
  (`playwright.chromium.connect_over_cdp`). Reuse the existing page instead of opening new ones.

## Emulating a phone properly
Behaviour is gated on `(pointer: coarse)`, so device metrics alone are not enough:
- `Emulation.setDeviceMetricsOverride` {width, height, deviceScaleFactor, mobile: true}
- `Emulation.setTouchEmulationEnabled` {enabled: true, maxTouchPoints: 5}
- `Emulation.setEmulatedMedia` with features `pointer=coarse`, `any-pointer=coarse`, `hover=none`
- Gotchas:
  - Always `Emulation.clearDeviceMetricsOverride` before re-applying, otherwise resizes are flaky.
  - A Playwright `page.screenshot()` clobbers the manual metrics override (DPR silently drops to 1).
    Re-apply the override after every screenshot.
  - Use raw `Input.dispatchTouchEvent` (touchStart/touchMove/touchEnd) for real touch — Playwright's
    mouse API does not exercise the touch paths.

## Multi-touch (second finger / pinch) with CDP
Essential for testing the `state.pointerId` drag guard:
- Each touch point needs its **own `id`**. A helper that hard-codes `id: 1` for every point cannot
  express two fingers — accept `(x, y, id)` tuples and pass the id through to `touchPoints`.
- **`touchEnd` takes the points that are BEING RELEASED**, not the ones still down. Passing the
  remaining finger releases the *wrong* pointer and looks exactly like the app dropping the drag —
  a very easy false positive. To lift finger B while A stays down, send
  `touchEnd` with `[(Bx, By, 2)]`.
- `touchMove` takes all currently-down points. A pinch = one `touchStart` with both points, then
  `touchMove`s that spread them apart.
- Distinct touch ids surface as distinct `pointerId`s in the page (they increment per gesture, e.g.
  A=2, B=3), so read `state.pointerId` rather than assuming a value.
- To prove the guard, add a passive `touchstart` listener plus a capture-phase recorder of
  `[type, e.pointerId]` for pointerdown/move/up/cancel; then assert `state.drag` / `state.pointerId`
  are unchanged and `state.quad` is bit-identical across the second finger's whole down/move/up cycle.
- Foreign-pointer robustness is also testable synthetically without touch:
  `stage.dispatchEvent(new PointerEvent('pointercancel', {pointerId: 9999, bubbles: true}))` must not
  end an active drag.

## Asserting on a canvas app
DOM state is not proof for a canvas UI. Read real pixels:
- `ctx.getImageData` probes for the active (blue) handle position, and a "distinct quantised colours"
  count inside the loupe bubble to prove it shows photo content rather than a flat fill.
- Compare against the app's own geometry (`state.quad`, `state.img`, canvas client rect) and convert
  image space ↔ client space; that catches drags that "work" in state but paint in the wrong place.
- `state.drag` idle value is `-1` (not null); `-2` means a whole-board drag; 0-3 are corners.

## Tapping controls inside a bottom sheet
- The phone layout is a fixed bottom sheet with a 56px peek; `#sheetToggle` toggles `.panel.open`
  plus `body.sheet-open`.
- Controls below the fold need an internal touch-scroll of the panel before tapping. Always:
  1. ensure the sheet is open (a stray tap on the grip closes it — helpers that call
     `bring_into_sheet` may already have opened it, so a subsequent explicit toggle *closes* it);
  2. scroll the target at least ~80px below the panel top, because the sheet grip is sticky and
     swallows taps in the first ~56px;
  3. verify with `document.elementFromPoint` that the tap will hit the intended element.
- After a page scroll, canvas client coordinates shift (they can go negative). Recompute the canvas
  rect right before dispatching touches.

## Element ids that are easy to get wrong
Grep `index.html` before writing selectors — several are not what you'd guess:
- The guides/handles checkbox is **`#showGuides`** (label "Show handles"), and `els.guides` in app.js.
- Placement buttons are `[data-placement="left|center|right"]` (not `data-place`).
- `placedQuad(w, h, placement)` takes the **image dimensions first**; call it as
  `placedQuad(state.img.width, state.img.height, placement)` when computing expected corners.
- Presets are generated into `#presets`; select children like `#presets button:nth-child(3)`.
- The text size slider is `#scale` (range 40-130, default 88). Drag its track by touch after scrolling
  it into the sheet; verify `document.elementFromPoint` returns `scale` first, otherwise the value
  silently stays at 88 and looks like a broken slider.

## Stubbing Web Share to test the export button label
The export button relabels to "Share image" only when `canShareFile()` (= `navigator.canShare &&
navigator.share && navigator.canShare({files:[f]})`) is true **and** the pointer is coarse.
- Chrome for Testing on Linux has **neither** `navigator.canShare` nor `navigator.share`, so the
  unstubbed label is always "Download PNG" — a test that only checks the real browser is NOT
  discriminating and will pass even if the predicate is wrong.
- Stub before app code runs with `Page.addScriptToEvaluateOnNewDocument`. **You must send
  `Page.enable` first**, or the script is silently ignored (label looks unchanged and you'll chase a
  phantom bug). Remove it afterwards with `Page.removeScriptToEvaluateOnNewDocument`.
- Test three cases: canShare present + share absent ⇒ "Download PNG" (catches a `canShare`-only
  gate); both present + coarse ⇒ "Share image"; both present + fine pointer ⇒ "Download PNG".
- The real `navigator.share({files})` branch cannot be exercised here — report it as untested rather
  than inferring it from the label.

## Export / download verification
- Downloads: `Browser.setDownloadBehavior` {behavior: allowAndName, downloadPath: ...}; the file lands
  as `do-it-all-with-devin.png`. Verify exact pixel size with PIL, not the status text alone.
- Expected sizes: sample city always 1600×1000; a 4032×3024 upload becomes 2560×1920 on coarse
  pointers (MAX_SRC 2560) and stays 4032×3024 on desktop (4096).
- The "button disabled + Rendering at full resolution…" transient is often shorter than a CDP
  round-trip. Install an in-page `requestAnimationFrame` recorder that logs every change of
  `[download.disabled, status.textContent]` *before* clicking, then read it back.

## Scroll-vs-drag
- Canvas uses `touch-action: pan-y pinch-zoom` and preventDefaults only when the touch lands on a
  handle or inside the board quad. To test the scrolling half you need a viewport where the document
  actually overflows — 390×844 usually does not. 768×1024 coarse does (docH ≈ 1415).
- Record `e.defaultPrevented` from a passive `touchstart` listener you add yourself.

## Stage sizing / sheet overlap
`stageMaxHeight()` measures real layout rather than a hard-coded gutter. Mirror the formula in the
test instead of hard-coding expected heights, then assert it:
```
room = innerHeight - .topbar.offsetHeight - main.paddingTop - main.paddingBottom
     - (.stage-inner.offsetHeight - .clientHeight)              // border/frame
     - (.stage-foot.offsetHeight ? offsetHeight + marginTop : 0) // 0 when display:none
     - (panel.open ? panel.offsetHeight : --sheet-peek)
```
- The core invariant at every viewport and in every sheet state:
  `canvas.getBoundingClientRect().bottom <= panel.getBoundingClientRect().top`.
- Include the **extra-short coarse landscape** sizes 640×320 and 568×320 — a floor that is too high
  (the old `Math.max(120, …)`) only shows up there, and `.stage-foot` is `display:none` in short
  coarse landscape while `body.sheet-open`, so a formula that doesn't special-case it over-subtracts.
- Also assert the stage does **not** collapse to the floor: canvas height should stay a sensible share
  of the viewport with the sheet closed (~0.27 portrait, ~0.44-0.54 landscape). A "no overlap" test
  alone passes trivially if the board shrinks to nothing.
- Cycle open/close at least twice and do a portrait↔landscape round-trip **with the sheet left open**;
  compare rects for drift and check `state.quad` is preserved bit-for-bit.

## Known/suspect issues to re-check
- Short coarse landscape overlap was fixed by the measured `stageMaxHeight()` (13.7px clearance at
  844×390). If the layout, `.stage-foot`, or the topbar changes, re-run the invariant above — it is
  the first thing to break.
- The sticky sheet grip still swallows taps in roughly the first 56px of the open sheet; a control
  scrolled to just under the grip is unreachable. Keep tap targets ~80px below the panel top.

## Devin Secrets Needed
- none (fully local static site).
