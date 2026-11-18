/* BrainGuard Companion — the model
   Everything here is deterministic scoring over the user's own entries.
   No diagnosis, no probability of disease, no invented precision: each score is
   a 0-100 summary of a documented risk factor, and each insight names the
   factors and the number of days behind it.

   Evidence tags are orientation for the reader, not validation of this build. */
(function (root) {
  "use strict";

  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var round = function (v) { return Math.round(v); };

  /* ---------------- factor definitions ---------------- */

  var FACTORS = [
    { id: "sleep", domain: "sleep", icon: "moon", evidence: ["Sabia 2021", "AHA LE8 2022"] },
    { id: "stress", domain: "sleep", icon: "pulse", evidence: ["AHA LE8 2022"] },
    { id: "mood", domain: "mind", icon: "heart", evidence: ["Lancet 2024"] },
    { id: "move", domain: "heart", icon: "bolt", evidence: ["WHO 2020"] },
    { id: "bp", domain: "heart", icon: "bp", evidence: ["INTERSTROKE 2016"] },
    { id: "smoke", domain: "heart", icon: "smoke", evidence: ["WHO 2019"] },
    { id: "alcohol", domain: "heart", icon: "cup", evidence: ["WHO 2019"] },
    { id: "diet", domain: "heart", icon: "food", evidence: ["Morris 2015"] },
    { id: "connect", domain: "mind", icon: "people", evidence: ["Livingston 2024"] },
    { id: "hear", domain: "senses", icon: "ear", evidence: ["Livingston 2024"] },
    { id: "vision", domain: "senses", icon: "eye", evidence: ["Lancet 2024"] },
    { id: "mind", domain: "mind", icon: "brain", evidence: ["FINGER 2015"] }
  ];

  var DOMAINS = [
    { id: "heart", weight: 0.28, factors: { bp: 0.34, smoke: 0.2, move: 0.22, diet: 0.14, alcohol: 0.1 } },
    { id: "sleep", weight: 0.22, factors: { sleep: 0.7, stress: 0.3 } },
    { id: "mind", weight: 0.2, factors: { mind: 0.4, connect: 0.35, mood: 0.25 } },
    { id: "senses", weight: 0.1, factors: { hear: 0.5, vision: 0.5 } },
    { id: "motion", weight: 0.2, factors: null }
  ];

  /* ---------------- single-entry scores ---------------- */

  function scoreSleep(v) {
    var h = v.sleepH, q = v.sleepQ;
    if (h === null || h === undefined || h === "") return null;
    h = Number(h);
    if (isNaN(h)) return null;
    var s;
    if (h >= 7 && h <= 9) s = 100;
    else if (h >= 6.5) s = 80;
    else if (h >= 6) s = 62;
    else if (h >= 5) s = 42;
    else if (h >= 4) s = 26;
    else s = 12;
    if (h > 9) s = h <= 10 ? 72 : 52;
    if (q) s += (Number(q) - 3) * 6;
    return clamp(round(s), 0, 100);
  }

  function scoreStress(v) {
    if (v.stress === null || v.stress === undefined || v.stress === "") return null;
    return clamp(round(100 - Number(v.stress) * 9), 0, 100);
  }

  function scoreMood(v) {
    if (!v.mood) return null;
    return clamp(round((Number(v.mood) - 1) * 25), 0, 100);
  }

  function scoreBp(v) {
    var s = Number(v.bpSys), d = Number(v.bpDia);
    if (!s || !d) return null;
    if (s < 120 && d < 80) return 100;
    if (s < 130 && d < 80) return 88;
    if (s < 140 && d < 90) return 66;
    if (s < 160 && d < 100) return 38;
    if (s < 180 && d < 120) return 14;
    return 4;
  }

  function scoreSmoke(v) {
    if (!v.smoke) return null;
    return { none: 100, occ: 45, daily: 12 }[v.smoke] || null;
  }

  function scoreAlcohol(v) {
    if (!v.alcohol) return null;
    return { none: 100, low: 78, mid: 45, high: 15 }[v.alcohol] || null;
  }

  function scoreDiet(v) {
    if (v.dietVeg === undefined && v.dietFried === undefined && v.dietSalt === undefined) return null;
    var pts = 0, seen = 0;
    var map = { never: 0, once: 1, twice: 2 };
    if (v.dietVeg !== undefined && v.dietVeg !== "") { pts += [6, 18, 30][map[v.dietVeg]]; seen += 30; }
    if (v.dietFried !== undefined && v.dietFried !== "") { pts += [30, 18, 6][map[v.dietFried]]; seen += 30; }
    if (v.dietSalt !== undefined && v.dietSalt !== "") { pts += [40, 24, 8][map[v.dietSalt]]; seen += 40; }
    if (!seen) return null;
    return clamp(round((pts / seen) * 100), 0, 100);
  }

  function scoreConnect(v) {
    if (!v.connect) return null;
    return { daily: 100, weekly: 78, rare: 42, never: 15 }[v.connect] || null;
  }

  function scoreHear(v) {
    if (!v.hear) return null;
    return { no: 100, some: 60, yes: 25 }[v.hear] || null;
  }

  function scoreVision(v) {
    if (!v.vision) return null;
    return { no: 100, some: 60, yes: 25 }[v.vision] || null;
  }

  function scoreMind(v) {
    if (v.mindDays === undefined || v.mindDays === "") return null;
    var d = Number(v.mindDays);
    if (isNaN(d)) return null;
    return clamp(round((d / 3) * 100), 0, 100);
  }

  var SCORERS = {
    sleep: scoreSleep, stress: scoreStress, mood: scoreMood, bp: scoreBp, smoke: scoreSmoke,
    alcohol: scoreAlcohol, diet: scoreDiet, connect: scoreConnect, hear: scoreHear,
    vision: scoreVision, mind: scoreMind
  };

  // Movement is a weekly quantity, so it is scored over a window rather than a day.
  function moveScoreFor(logs, dateKey, shift) {
    var total = 0, seen = 0;
    var end = dateKey;
    for (var i = 0; i < 7; i++) {
      var k = shift(end, -i);
      var e = null;
      for (var j = 0; j < logs.length; j++) if (logs[j].date === k) { e = logs[j]; break; }
      if (e && e.moveMin !== undefined && e.moveMin !== null && e.moveMin !== "") {
        total += Number(e.moveMin) || 0;
        seen++;
      }
    }
    if (!seen) return null;
    return clamp(round((total / 150) * 100), 0, 100);
  }

  /* ---------------- aggregated factor scores ---------------- */

  function factorSeries(logs, shift) {
    var out = {};
    FACTORS.forEach(function (f) { out[f.id] = []; });
    logs.forEach(function (l) {
      FACTORS.forEach(function (f) {
        var v;
        if (f.id === "move") v = moveScoreFor(logs, l.date, shift);
        else v = SCORERS[f.id] ? SCORERS[f.id](l) : null;
        if (v !== null && v !== undefined) out[f.id].push({ date: l.date, v: v });
      });
    });
    return out;
  }

  function mean(arr) {
    if (!arr.length) return null;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function median(arr) {
    if (!arr.length) return null;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function factorAverages(logs, shift, days) {
    var series = factorSeries(logs, shift);
    var out = {};
    FACTORS.forEach(function (f) {
      var vals = series[f.id].slice(-days).map(function (p) { return p.v; });
      out[f.id] = { value: vals.length ? round(mean(vals)) : null, n: vals.length, series: series[f.id] };
    });
    return out;
  }

  /* ---------------- sensor model ---------------- */

  var METRIC_LABEL = {
    tapRate: "m_tap_rate", tapCv: "m_tap_cv", speechRate: "m_speech_rate", f0Sd: "m_f0",
    pauseRatio: "m_pause", swayRms: "m_sway",     rtMedian: "m_rt", rtCv: "m_rt_cv", rtErrors: "m_rt_err",
    faceAsym: "m_asym", blinkRate: "m_blink"
  };

  var METRICS = [
    { id: "tapRate", dir: 1, unit: "/s" },
    { id: "tapCv", dir: -1, unit: "%" },
    { id: "speechRate", dir: 1, unit: "/s" },
    { id: "f0Sd", dir: -1, unit: "st" },
    { id: "pauseRatio", dir: -1, unit: "%" },
    { id: "swayRms", dir: -1, unit: "mg" },
    { id: "rtMedian", dir: -1, unit: "ms" },
    { id: "rtCv", dir: -1, unit: "%" },
    { id: "faceAsym", dir: -1, unit: "%" }
  ];

  function metricValues(sessions, id) {
    return sessions.map(function (s) { return s.metrics && s.metrics[id]; })
      .filter(function (v) { return typeof v === "number" && isFinite(v); });
  }

  // Robust z: median / MAD. Below three prior sessions we refuse to call a change.
  function baseline(sessions, id, excludeLast) {
    var pool = excludeLast ? sessions.slice(0, sessions.length - 1) : sessions;
    var vals = metricValues(pool, id);
    if (vals.length < 2) return null;
    var med = median(vals);
    var dev = vals.map(function (v) { return Math.abs(v - med); });
    // Floor the spread at 4% of the median: with three baseline points a tiny MAD
    // would otherwise turn a 5% wobble into a 10-sigma "change".
    var mad = Math.max(median(dev), Math.abs(med) * 0.04, 0.0001);
    return { med: med, mad: mad, n: vals.length };
  }

  function zScore(sessions, id, value) {
    var b = baseline(sessions, id, true);
    if (!b || typeof value !== "number") return null;
    return 0.6745 * (value - b.med) / b.mad;
  }

  // Tests are run one at a time in practice, so a metric must be judged against
  // its own history rather than against "the last two sessions".
  function metricSeries(sessions, id) {
    return sessions.map(function (s) { return s.metrics ? s.metrics[id] : null; })
      .filter(function (v) { return typeof v === "number" && isFinite(v); });
  }

  function zAgainst(base, value) {
    if (!base || base.length < 2 || typeof value !== "number") return null;
    var med = median(base);
    var dev = base.map(function (v) { return Math.abs(v - med); });
    var mad = Math.max(median(dev), Math.abs(med) * 0.04, 0.0001);
    return 0.6745 * (value - med) / mad;
  }

  function motionDomain(sessions) {
    if (sessions.length < 3) return { value: null, n: sessions.length, deltas: [] };
    var scores = [], deltas = [];
    METRICS.forEach(function (m) {
      var series = metricSeries(sessions, m.id);
      if (series.length < 3) return;
      var v = series[series.length - 1];
      var z = zAgainst(series.slice(0, -1), v);
      if (z === null) return;
      scores.push(clamp(100 - Math.abs(z) * 15, 0, 100));
      if (Math.abs(z) >= 1.4) {
        deltas.push({ id: m.id, z: z, dir: z > 0 ? m.dir : -m.dir, value: v });
      }
    });
    return {
      value: scores.length ? round(mean(scores)) : null,
      n: sessions.length,
      deltas: deltas
    };
  }

  /* ---------------- domains and index ---------------- */

  function domains(logs, sessions, shift, windowDays) {
    var avg = factorAverages(logs, shift, windowDays || 7);
    var out = {};
    DOMAINS.forEach(function (d) {
      if (!d.factors) {
        out[d.id] = motionDomain(sessions);
        return;
      }
      var num = 0, den = 0, missing = 0;
      Object.keys(d.factors).forEach(function (fid) {
        var v = avg[fid] ? avg[fid].value : null;
        if (v === null) { missing++; return; }
        num += v * d.factors[fid];
        den += d.factors[fid];
      });
      out[d.id] = {
        value: den > 0 ? round(num / den) : null,
        coverage: den / Object.keys(d.factors).reduce(function (s, k) { return s + d.factors[k]; }, 0),
        missing: missing,
        factors: avg
      };
    });
    var bhi = 0, wsum = 0;
    DOMAINS.forEach(function (d) {
      var v = out[d.id].value;
      if (v === null) return;
      bhi += v * d.weight;
      wsum += d.weight;
    });
    out.index = wsum > 0 ? round(bhi / wsum) : null;
    out.weightCovered = wsum;
    return out;
  }

  /* ---------------- insights ---------------- */

  var SEV_ORDER = { good: 0, info: 1, watch: 2, act: 3, urgent: 4 };

  function avgOf(logs, field, filter) {
    var vals = logs.map(function (l) { return l[field]; })
      .filter(function (v) { return v !== undefined && v !== null && v !== "" && (!filter || filter(v)); })
      .map(Number).filter(function (v) { return !isNaN(v); });
    return vals.length ? mean(vals) : null;
  }

  function latest(logs, field) {
    for (var i = logs.length - 1; i >= 0; i--) {
      var v = logs[i][field];
      if (v !== undefined && v !== null && v !== "") return { v: v, date: logs[i].date };
    }
    return null;
  }

  function insights(ctx) {
    var logs = ctx.logs || [];
    var days = logs.length;
    var out = [];
    var n7 = logs.slice(-7);

    function conf(n) { return n >= 14 ? "high" : n >= 7 ? "mid" : "low"; }

    // Blood pressure first: it is the highest-yield number here.
    var bp = latest(logs, "bpSys");
    if (bp) {
      var row = logs.filter(function (l) { return l.date === bp.date; })[0] || {};
      var s = Number(bp.v), d = Number(row.bpDia || 0);
      if (s >= 180 || d >= 120) {
        out.push({
          id: "bp_crisis", sev: "urgent", domain: "heart",
          titleKey: "in_bp_t", bodyKey: "in_bp_b", vars: { v: s + "/" + d },
          drivers: [{ key: "drv_bp", dir: -1 }], n: n7.length, confidence: "high",
          evidence: ["INTERSTROKE 2016"]
        });
      } else if (s >= 140 || d >= 90) {
        out.push({
          id: "bp_high", sev: "act", domain: "heart",
          titleKey: "in_bp_t", bodyKey: "in_bp_b", vars: { v: s + "/" + d },
          drivers: [{ key: "drv_bp", dir: -1 }, { key: "drv_diet", dir: -1 }],
          n: n7.length, confidence: conf(days), evidence: ["INTERSTROKE 2016", "AHA LE8 2022"]
        });
      }
    }

    var sleepH = avgOf(n7, "sleepH");
    if (sleepH !== null && sleepH < 6.5) {
      out.push({
        id: "sleep_short", sev: sleepH < 5.5 ? "act" : "watch", domain: "sleep",
        titleKey: "in_sleep_t", bodyKey: "in_sleep_b", vars: { h: sleepH.toFixed(1) },
        drivers: [{ key: "drv_sleep", dir: -1 }, { key: "drv_stress", dir: -1 }],
        n: n7.length, confidence: conf(days), evidence: ["Sabia 2021", "AHA LE8 2022"]
      });
    }

    var move = moveScoreFor(logs, ctx.today, ctx.shift);
    if (move !== null && move < 100) {
      var total = 0, seen = 0;
      for (var i = 0; i < 7; i++) {
        var k = ctx.shift(ctx.today, -i);
        var e = logs.filter(function (l) { return l.date === k; })[0];
        if (e && e.moveMin !== undefined && e.moveMin !== "") { total += Number(e.moveMin) || 0; seen++; }
      }
      if (seen >= 3) {
        out.push({
          id: "move_low", sev: total < 60 ? "act" : "watch", domain: "heart",
          titleKey: "in_move_t", bodyKey: "in_move_b", vars: { m: total },
          drivers: [{ key: "drv_move", dir: -1 }], n: seen, confidence: conf(days),
          evidence: ["WHO 2020", "AHA LE8 2022"]
        });
      }
    }

    // Cross-factor synthesis: one pattern card, only when two risks actually
    // co-occur week after week rather than on a single bad day.
    if (days >= 14) {
      var weeks = {};
      logs.forEach(function (l) {
        var d = new Date(l.date + "T00:00:00");
        var dow = (d.getDay() + 6) % 7;
        d.setDate(d.getDate() - dow);
        var wk = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
        weeks[wk] = weeks[wk] || { sleep: [], move: 0, n: 0 };
        if (l.sleepH !== undefined && l.sleepH !== null && l.sleepH !== "") weeks[wk].sleep.push(Number(l.sleepH));
        if (l.moveMin !== undefined && l.moveMin !== null && l.moveMin !== "") weeks[wk].move += Number(l.moveMin) || 0;
        weeks[wk].n++;
      });
      var together = 0;
      Object.keys(weeks).forEach(function (k) {
        var w = weeks[k];
        if (w.n < 5) return;
        var s = mean(w.sleep);
        if (s !== null && s < 6.5 && w.move < 150) together++;
      });
      if (together >= 2 && sleepH !== null) {
        out.push({
          id: "pattern_sleep_move", sev: "watch", domain: "sleep",
          titleKey: "in_pattern_t", bodyKey: "in_pattern_b", vars: { n: together },
          drivers: [{ key: "drv_sleep", dir: -1 }, { key: "drv_move", dir: -1 }],
          n: days, confidence: conf(days), evidence: ["Sabia 2021", "WHO 2020"]
        });
      }
    }

    var stress = avgOf(n7, "stress");
    if (stress !== null && stress >= 7) {
      out.push({
        id: "stress_high", sev: "watch", domain: "sleep",
        titleKey: "in_stress_t", bodyKey: "in_stress_b", vars: { v: stress.toFixed(1) },
        drivers: [{ key: "drv_stress", dir: -1 }, { key: "drv_sleep", dir: -1 }],
        n: n7.length, confidence: conf(days), evidence: ["AHA LE8 2022"]
      });
    }

    var lowMood = n7.filter(function (l) { return Number(l.mood) <= 2; }).length;
    if (lowMood >= 5) {
      out.push({
        id: "mood_low", sev: "act", domain: "mind",
        titleKey: "in_mood_t", bodyKey: "in_mood_b", vars: {},
        drivers: [{ key: "drv_mood", dir: -1 }], n: n7.length, confidence: conf(days),
        evidence: ["Lancet 2024"]
      });
    }

    var rare = n7.filter(function (l) { return l.connect === "rare" || l.connect === "never"; }).length;
    if (rare >= 4) {
      out.push({
        id: "connect_low", sev: "watch", domain: "mind",
        titleKey: "in_connect_t", bodyKey: "in_connect_b", vars: {},
        drivers: [{ key: "drv_connect", dir: -1 }], n: n7.length, confidence: conf(days),
        evidence: ["Livingston 2024"]
      });
    }

    var smoke = latest(logs, "smoke");
    if (smoke && smoke.v === "daily") {
      out.push({
        id: "smoke_daily", sev: "act", domain: "heart",
        titleKey: "in_smoke_t", bodyKey: "in_smoke_b", vars: {},
        drivers: [{ key: "drv_smoke", dir: -1 }], n: days, confidence: "high", evidence: ["WHO 2019"]
      });
    }

    var alc = latest(logs, "alcohol");
    if (alc && alc.v === "high") {
      out.push({
        id: "alcohol_high", sev: "watch", domain: "heart",
        titleKey: "in_alcohol_t", bodyKey: "in_alcohol_b", vars: { v: "8+" },
        drivers: [{ key: "drv_alcohol", dir: -1 }], n: days, confidence: "mid", evidence: ["WHO 2019"]
      });
    }

    var hear = latest(logs, "hear");
    if (hear && hear.v === "yes") {
      out.push({
        id: "hear_trouble", sev: "watch", domain: "senses",
        titleKey: "in_hear_t", bodyKey: "in_hear_b", vars: {},
        drivers: [{ key: "drv_hear", dir: -1 }], n: days, confidence: "mid", evidence: ["Livingston 2024"]
      });
    }

    var vis = latest(logs, "vision");
    if (vis && vis.v === "yes") {
      out.push({
        id: "vision_trouble", sev: "watch", domain: "senses",
        titleKey: "in_vision_t", bodyKey: "in_vision_b", vars: {},
        drivers: [{ key: "drv_vision", dir: -1 }], n: days, confidence: "mid", evidence: ["Lancet 2024"]
      });
    }

    // Measured change: only when two consecutive sessions move the same way.
    var sess = ctx.sessions || [];
    if (sess.length >= 4) {
      var last = sess[sess.length - 1];
      var prev = sess[sess.length - 2];
      // One card for the whole battery, not one per metric: several signals often
      // move together, and five separate cards would read as five diseases.
      var changed = [];
      METRICS.forEach(function (m) {
        var series = metricSeries(sess, m.id);
        if (series.length < 4) return; // two baseline points plus two recent ones
        var lastV = series[series.length - 1];
        var prevV = series[series.length - 2];
        var zLast = zAgainst(series.slice(0, -1), lastV);
        var zPrev = zAgainst(series.slice(0, -2), prevV);
        if (zLast === null || zPrev === null) return;
        if (Math.abs(zLast) >= 2 && Math.abs(zPrev) >= 1.5 && Math.sign(zLast) === Math.sign(zPrev)) {
          changed.push({ id: m.id, z: Math.min(4, Math.abs(zLast)), dir: zLast > 0 ? m.dir : -m.dir });
        }
      });
      if (changed.length) {
        changed.sort(function (a, b) { return b.z - a.z; });
        out.push({
          id: "sensor_change", sev: changed.length >= 3 ? "act" : "watch", domain: "motion",
          titleKey: "in_sensor_t", bodyKey: "in_sensor_b2",
          vars: { d: changed[0].z.toFixed(1) + " σ" },
          drivers: (function () {
            var seen = {}, out2 = [];
            changed.forEach(function (c) {
              var k = "drv_" + shortMetric(c.id);
              if (seen[k] || out2.length >= 4) return;
              seen[k] = 1;
              out2.push({ key: k, dir: c.dir });
            });
            return out2;
          })(),
          n: sess.length, confidence: "low", evidence: ["FINGER 2015"]
        });
      }
    }

    if (!out.length && days >= 3) {
      out.push({
        id: "steady", sev: "good", domain: "mind",
        titleKey: "in_good_t", bodyKey: "in_good_b", vars: {},
        drivers: [], n: days, confidence: conf(days), evidence: ["AHA LE8 2022"]
      });
    }

    out.sort(function (a, b) { return SEV_ORDER[b.sev] - SEV_ORDER[a.sev]; });
    return out;
  }

  function shortMetric(id) {
    return {
      tapRate: "tap", tapCv: "tap", speechRate: "speech", f0Sd: "speech", pauseRatio: "speech",
      swayRms: "sway", rtMedian: "rt", rtCv: "rt", faceAsym: "face"
    }[id] || "tap";
  }

  /* ---------------- weekly plan ---------------- */

  var PLAN_LIBRARY = {
    sleep: [{ key: "pa_sleep_1", ev: "AHA LE8 2022" }, { key: "pa_sleep_2", ev: "Sabia 2021" }],
    stress: [{ key: "pa_stress_1", ev: "AHA LE8 2022" }, { key: "pa_stress_2", ev: "WHO 2019" }],
    move: [{ key: "pa_move_1", ev: "WHO 2020" }, { key: "pa_move_2", ev: "WHO 2019" }],
    bp: [{ key: "pa_bp_1", ev: "INTERSTROKE 2016" }],
    diet: [{ key: "pa_diet_1", ev: "Morris 2015" }, { key: "pa_diet_2", ev: "Morris 2015" }],
    connect: [{ key: "pa_connect_1", ev: "Livingston 2024" }],
    mind: [{ key: "pa_mind_1", ev: "FINGER 2015" }, { key: "pa_mind_2", ev: "FINGER 2015" }],
    smoke: [{ key: "pa_smoke_1", ev: "WHO 2019" }],
    alcohol: [{ key: "pa_alcohol_1", ev: "WHO 2019" }],
    hear: [{ key: "pa_hear_1", ev: "Livingston 2024" }],
    vision: [{ key: "pa_vision_1", ev: "Lancet 2024" }],
    mood: [{ key: "pa_mood_1", ev: "Lancet 2024" }],
    base: [{ key: "pa_base_1", ev: "FINGER 2015" }, { key: "pa_base_2", ev: "FINGER 2015" }]
  };

  function weekStart(dateKey) {
    var p = dateKey.split("-");
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    var dow = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - dow);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  function buildPlan(ctx, existing) {
    var avg = factorAverages(ctx.logs, ctx.shift, 7);
    var ranked = FACTORS.map(function (f) {
      return { id: f.id, v: avg[f.id].value, n: avg[f.id].n };
    }).filter(function (f) { return f.v !== null; })
      .sort(function (a, b) { return a.v - b.v; });

    // Actions follow the current flags first, then the lowest remaining factors.
    var flags = insights({ logs: ctx.logs, sessions: ctx.sessions || [], today: ctx.today, shift: ctx.shift });
    var focus = [];
    flags.forEach(function (i) {
      (i.drivers || []).forEach(function (d) {
        var id = String(d.key).replace("drv_", "");
        if (PLAN_LIBRARY[id] && focus.indexOf(id) < 0) focus.push(id);
      });
    });

    var items = [];
    var chosen = focus.map(function (id) { return { id: id }; })
      .concat(ranked.filter(function (f) { return focus.indexOf(f.id) < 0; }))
      .slice(0, 4);
    if (!chosen.length) chosen = [{ id: "base" }];

    chosen.forEach(function (f) {
      var lib = PLAN_LIBRARY[f.id] || [];
      if (!lib.length) return;
      var pick = lib[items.length % lib.length];
      // Rotate deterministically by week so the plan does not repeat forever.
      var wk = Number(weekStart(ctx.today).replace(/-/g, ""));
      if (lib.length > 1 && wk % 2 === 0) pick = lib[1];
      items.push({ id: "i" + items.length, factor: f.id, key: pick.key, ev: pick.ev, done: false });
    });

    if (items.length < 3) {
      PLAN_LIBRARY.base.forEach(function (b) {
        if (items.length >= 3) return;
        items.push({ id: "i" + items.length, factor: "base", key: b.key, ev: b.ev, done: false });
      });
    }

    if (existing && existing.weekStart === weekStart(ctx.today) && existing.items && existing.items.length) {
      // Keep completion state for identical rows.
      items.forEach(function (it) {
        var prev = existing.items.filter(function (p) { return p.key === it.key; })[0];
        if (prev) it.done = !!prev.done;
      });
    }

    return { weekStart: weekStart(ctx.today), items: items, builtAt: Date.now() };
  }

  /* ---------------- referral ladder ---------------- */

  function referral(ins) {
    var top = ins[0];
    if (!top) return { level: "none" };
    if (top.sev === "urgent") return { level: "now", insight: top };
    if (top.sev === "act") return { level: "soon", insight: top };
    if (top.sev === "watch") return { level: "watch", insight: top };
    return { level: "routine", insight: top };
  }

  root.BGModel = {
    FACTORS: FACTORS, DOMAINS: DOMAINS, METRICS: METRICS, SCORERS: SCORERS, METRIC_LABEL: METRIC_LABEL,
    scoreSleep: scoreSleep, scoreDiet: scoreDiet, scoreBp: scoreBp,
    factorSeries: factorSeries, factorAverages: factorAverages, moveScoreFor: moveScoreFor,
    domains: domains, motionDomain: motionDomain,
    baseline: baseline, zScore: zScore, metricValues: metricValues,
    metricSeries: metricSeries, zAgainst: zAgainst,
    insights: insights, buildPlan: buildPlan, weekStart: weekStart, referral: referral,
    mean: mean, median: median, clamp: clamp, round: round,
    SEV_ORDER: SEV_ORDER
  };
})(typeof self !== "undefined" ? self : this);
