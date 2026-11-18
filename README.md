# BrainGuard Companion

**Live:** https://hedephilip.github.io/brainguard-companion/

An offline-first brain-health companion with a BEFAST emergency route in the same app. Static site: no backend, no account, no analytics.

## What is here

| Route | Purpose |
|---|---|
| `#/today` | Brain-health index, ranked insights with drivers, domain radar, weekly plan preview |
| `#/log` | 60-second daily check-in across 12 modifiable factors |
| `#/check` | Five on-device tests: finger tapping, voice, standing sway, choice reaction time, optional face and eye landmarks |
| `#/trends` | 28/90-day factor series, per-metric baselines and z-scores |
| `#/plan` | Weekly 3–5 action plan drawn from the weakest factors |
| `#/report` | Printable one-page clinician summary |
| `#/privacy` | Consent per sensor, storage size, export / import / delete |
| `#/emergency` | BEFAST triage: any single sign is RED, resolved symptoms are AMBER, local emergency number |

## Design commitments

- **Any single current BEFAST sign is RED.** No weighting, no blood-pressure gate, no auto-dial.
- **Compare the user with themselves.** Baselines use median/MAD per metric, with a spread floor; a change needs two consecutive sessions.
- **Refuse bad data.** Every test gates on quality and declines to store a failed measurement.
- **Nothing leaves the device.** Camera frames, audio and motion are processed in memory and discarded; only derived numbers are stored.
- **No diagnosis.** Scores summarise documented risk factors. They are not probabilities of disease.

## Run locally

```powershell
python -m http.server 8765 --directory .
```

Then open http://127.0.0.1:8765/. Camera, microphone and motion require HTTPS or localhost.

## Tests

```powershell
node test/logic-test.js
```

49 checks in total: 34 model, 10 emergency-engine and 5 tapping-pipeline. Tests ship with the source package (`node test/logic-test.js`, `node test/tap-test.js`).

## Language

English, Bahasa Melayu, 中文, Español — full interface, switchable at runtime.

## Status

Functional prototype submitted to the Future Health Digital Innovation Challenge. Not a medical device, not validated, no clinical claims.
