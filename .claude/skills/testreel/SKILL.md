---
name: testreel
description: Record polished product demo videos (MP4/GIF/WebM with animated cursor, macOS window chrome, gradient background, zoom-on-click) of the Pulse web app from JSON step definitions, using testreel + Playwright. Use when asked to record, re-record or update the demo video, make a GIF of a flow, capture screenshots for Devpost/README, or film a scene from docs/VIDEO_SCRIPT.md.
---

# testreel — demo videos for Pulse

testreel (MIT, github.com/greentfrapp/testreel, v0.2.0) turns a JSON/JSONC/YAML list of browser steps into a post-processed screen recording. Installed as root dev deps (`testreel`, `playwright`); Chromium installed via `npx playwright install chromium`; ffmpeg is at `/opt/homebrew/bin/ffmpeg`. Full docs: `node_modules/testreel/dist/docs/` (read `actions.md` and `recording-definitions.md` before writing new definitions).

## Files
- `video/*.jsonc` — recording definitions (committed). Start from these:
  - `landing.jsonc` — public landing + sign-in (no auth; pipeline smoke test)
  - `dashboard-tour.jsonc` — signed-in dashboard: twin status, briefing Play, heart-rate chart, alerts
  - `demo-workout.jsonc` — `/demo` "Workout now" then the dashboard. **Side effect: writes real data and sends a real iMessage to the linked phone.** Workout alerts have a 2 h cooldown, so re-runs inside 2 h show no new alert.
- `video/.auth/state.json` — signed-in session (gitignored; contains a login cookie, never commit or print it)
- `video/output/<name>/` — videos, screenshots, `output.json` (gitignored)

## Commands
```bash
export PULSE_URL=https://pulse-mhacks.vercel.app          # or http://localhost:3000
npx testreel validate video/dashboard-tour.jsonc           # check a definition
npx testreel video/landing.jsonc --output video/output/landing --clean
npx testreel video/dashboard-tour.jsonc --output video/output/dashboard --clean --headed   # watch it run
npx testreel video/demo-workout.jsonc --format gif --speed 1.5                            # GIF for README
```

## Auth (signed-in pages)
Neon Auth sessions are cookies. The **user** signs in once; never type passwords for them:
```bash
npx testreel login https://pulse-mhacks.vercel.app/auth/sign-in --save-state video/.auth/state.json
```
A browser opens; the user signs in as the demo account (Robin) and closes the window. Then use `"storageState": "./video/.auth/state.json"` (paths resolve from the repo root). Re-run `login` if recordings land on the sign-in page.

## Writing definitions
- Selectors: prefer Playwright role/text selectors that match the app's aria labels, e.g. `role=button[name='Run scenario: Illness onset']`, `role=button[name='Play the morning briefing']`, `role=link[name='Dashboard']`, `text=Heart rate`. Check labels with the browser pane's `find`/`read_page` before recording.
- House style (keep consistent across scenes): `viewport` 1440×900, `outputSize` 1920×1080, `colorScheme` dark (switch to light if the app theme changes), `outputFormat` mp4, `cursor.style` pointer, `chrome.url` showing the page, `background.gradient` `#1f1a17 → #3a2a20`, padding 64, radius 14.
- Pacing: `pauseAfter` 1–2 s on things the narrator talks about; `zoom` (scale 1.4–1.8) on the key element, then `{ "action": "zoom", "scale": 1 }`; wait 6–10 s after scenario buttons so alerts arrive.
- Map scenes to `docs/VIDEO_SCRIPT.md` timings; one definition per scene, then concatenate with ffmpeg (`ffmpeg -f concat -safe 0 -i list.txt -c copy out.mp4`).
- iMessage, Google Calendar and ASI:One scenes are outside the web app: record the phone with QuickTime / screen capture, and Google Calendar only with the user's own signed-in browser.

## Verify
After a run: `ffprobe -v error -show_entries format=duration:stream=width,height -of compact <mp4>`, then extract a frame (`ffmpeg -ss 3 -i <mp4> -frames:v 1 frame.png`) and look at it. Check `output.json` for the file list.
