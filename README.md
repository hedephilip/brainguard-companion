# BrainGuard Companion v3

**Live:** https://hedephilip.github.io/brainguard-companion/ · **Repo:** https://github.com/hedephilip/brainguard-companion

An offline-first **continuous brain-health companion**. This build is the direct response to the Future Health Digital Innovation Challenge review of the BrainGuard prototype, which asked for protection *before* the emergency rather than another acute questionnaire.

Open `index.html` (or serve the folder) — no build step, no dependencies at runtime, no network calls.

---

## What the review asked for, and where it is answered

| Review point | Where it lives in this build |
|---|---|
| "Expand beyond emergency detection into a continuous cognitive wellness companion" | `#/today` + `#/log`: 12 modifiable factors, daily 60-second entry, streak, index and trends. Emergency is now one route among eight, not the product. |
| "Tracks everyday modifiable lifestyle habits such as sleep quality, stress, physical activity, and cardiovascular risk factors" | `assets/model.js` factor scorers: sleep, stress, mood, movement, blood pressure, smoking, alcohol, diet, connection, hearing, vision, new learning. |
| "Camera-based analysis … subtle motor or behavioral shifts" | `#/check`: five on-device tests — face/eye landmarks, voice, finger tapping, postural sway, choice reaction time. |
| "Periodic baseline check-ins" | Every test is compared with the user's **own** rolling baseline (median/MAD), never with a population norm. Three sessions before any trend is shown. |
| "Synthesize longitudinal lifestyle patterns … into clear, explainable risk insights" | `assets/model.js → insights()` produces severity-ranked cards, each with its drivers, the number of days behind it, a confidence level and an "why this appears" disclosure. |
| "Personalized brain-health routines" | `#/plan`: 3–5 actions drawn from the user's weakest factors, rotating weekly, each with its evidence tag. |
| "Avoids definitive clinical diagnoses" | No disease probability is computed anywhere. Scores are 0–100 summaries of documented risk factors; every surface repeats that this is not a diagnosis. |
| "Safeguards sensitive neurological and camera data with strict privacy controls" | `#/privacy`: per-sensor consent, no account, no server, no analytics, camera frames and audio are processed in memory and never stored, JSON export/import, one-click deletion. |
| "Maintains clear referral pathways" | `assets/model.js → referral()`: urgent → emergency route; act → "book within two weeks" plus the printable clinician report; watch → keep logging; routine → maintain. |

---

## Views

- **Today** — greeting, brain-health index ring, streak/coverage, ranked insights, domain radar, plan preview, pattern sparklines, baseline due card.
- **Daily log** — 12 factors, all optional; missing answers stay missing instead of being scored as zero.
- **Baseline check** — tap, voice, balance, reaction time, and an optional face/eye test. Every test reports quality separately and refuses to save a bad measurement.
- **Trends** — 28/90-day factor lines, domain radar, sensor table with per-metric z against the personal baseline.
- **This week** — adaptive multidomain plan with completion state.
- **Clinician report** — printable one-pager: index, domains, 28-day factor table, sensor history, current flagged items, privacy statement.
- **Privacy** — consent ledger, architecture diagram, storage size, export/import/delete.
- **Emergency** — country-aware emergency number, BE-FAST, "note the time of first symptom", and the clinical prototype link.

## Measurement details

| Test | Signals | Quality gate |
|---|---|---|
| Finger tapping (20 s) | taps/s, inter-tap CV, fatigue drift | ≥15 taps and CV ≤ 0.85 |
| Voice (10 s, count 1–10) | syllable rate, pause ratio, F0 SD in semitones (autocorrelation) | p90 level > 0.02, voiced > 25 %, ≥5 peaks |
| Balance (20 s standing) | linear-acceleration RMS, path, jerk | >150 samples, RMS < 400 mg |
| Reaction time (12 trials) | median RT, RT CV, errors | ≥5 valid trials, ≤3 errors |
| Face & eyes (8 s) | mouth/brow asymmetry normalised to inter-ocular distance, head jitter, blink rate | ≥20 landmark frames; degrades to motion-only with a visible "reduced precision" notice |

The face test uses MediaPipe Face Landmarker loaded from CDN on first use; if it is unavailable or blocked, the test still runs in reduced mode and says so. Everything else is plain browser APIs (`getUserMedia`, `DeviceMotionEvent`, `AudioContext`).

## Privacy model

- One `localStorage` document (`bg.companion.v3`). No cookies, no identifiers, no outbound requests.
- Camera frames are drawn to a hidden canvas for analysis and discarded; audio is analysed from an `AnalyserNode` and discarded; motion samples are discarded after the session.
- Only derived scalars are stored (`tapRate`, `swayRms`, …).
- Export is a plain JSON file the user owns; deletion is immediate and total.

## Run and deploy

```powershell
# local
python -m http.server 8765 --directory C:/dev/brainguard-companion

# tests — 49 checks
node test/logic-test.js      # 34 model
node test/emergency-test.js  # 10 emergency engine
node test/tap-test.js        # 5 tapping pipeline
```

Any static host works (GitHub Pages, Netlify, Vercel, S3, an nginx folder). `sw.js` gives an offline shell when served over HTTPS; sensor permissions require HTTPS or `localhost`.

## Evidence base

Orientation only — these are the sources the factor framing follows, not a validation of this prototype:
FINGER (Ngandu et al., Lancet 2015) · AHA Life's Essential 8 (2022) · WHO 2019 risk-reduction guidelines · WHO 2020 physical-activity guidance · Lancet Commission on dementia (2024) · INTERSTROKE (O'Donnell et al., 2016) · Sabia et al. (2021) · Morris et al. (MIND, 2015).

## Limits, stated plainly

- Not a medical device; not validated; no clinical claims.
- Sensor metrics are research-grade proxies, not diagnostic tests. A change is a reason to look, not a finding.
- Baselines need three sessions; below that the UI says "not enough data" instead of guessing.
- The demo dataset is synthetic and labelled as such on the Today screen.
- Browser support: Chrome/Edge/Safari current. `DeviceMotionEvent` needs a secure context and, on iOS, an explicit permission gesture.
