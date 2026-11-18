/* BrainGuard Companion — views, part 2
   Baseline check, clinician report, privacy, emergency. */
(function (root) {
  "use strict";

  var M = root.BGModel;
  var S = root.BGSensors;
  var H = function () { return root.BGViews.helpers; };
  function A() { return root.BG; }
  function t(k, v) { return A().t(k, v); }
  function esc(s) { return H().esc(s); }
  function icon(id, cls) { return H().icon(id, cls); }

  var active = null;

  /* ---------------- baseline check ---------------- */

  var TESTS = [
    { id: "tap", icon: "tap", title: "test_tap", desc: "test_tap_d", prep: "prep_tap", hint: "hint_tap" },
    { id: "speech", icon: "mic", title: "test_speech", desc: "test_speech_d", prep: "prep_speech", hint: "hint_speech" },
    { id: "balance", icon: "balance", title: "test_balance", desc: "test_balance_d", prep: "prep_balance", hint: "hint_balance" },
    { id: "rt", icon: "bolt", title: "test_rt", desc: "test_rt_d", prep: "prep_rt", hint: "hint_rt" },
    { id: "face", icon: "cam", title: "test_face", desc: "test_face_d", prep: "prep_face", hint: "hint_face" }
  ];

  function check(ctx) {
    var st = ctx.store;
    var sessions = st.sessions();

    // A session may contain only some tests, so look for the most recent one that
    // actually carries this test's primary metric.
    function lastWith(testId) {
      var key = { tap: "tapRate", speech: "speechRate", balance: "swayRms", rt: "rtMedian", face: "faceAsym" }[testId];
      for (var i = sessions.length - 1; i >= 0; i--) {
        if (sessions[i].metrics && typeof sessions[i].metrics[key] === "number") return sessions[i];
      }
      return null;
    }

    var html = '<section class="card"><div class="row between">' +
      "<div><h2>" + esc(t("check_t")) + '</h2><p class="hint">' + esc(t("check_b")) + "</p></div>" +
      '<span class="pill teal">' + sessions.length + " " + esc(t("d_tests")) + "</span></div>" +
      '<div class="callout info mt">' + esc(t("check_why")) + "</div>" +
      '<p class="hint mt-s">' + esc(t("check_privacy")) + "</p></section>";

    html += '<div class="lab mt">' + TESTS.map(function (test) {
      var last = lastWith(test.id);
      var val = last ? primaryMetric(test.id, last) : null;
      return '<article class="test">' +
        '<div class="th">' + icon(test.icon) + "<b>" + esc(t(test.title)) + "</b></div>" +
        "<p>" + esc(t(test.desc)) + "</p>" +
        '<div class="meta">' +
        (val !== null ? '<span class="chip teal">' + esc(val) + "</span>" : '<span class="chip ghost">' + esc(t("not_enough")) + "</span>") +
        '<span class="chip ghost">' + (last ? A().fmtDate(last.ts) : "—") + "</span></div>" +
        '<div class="btn-row"><button class="btn' + (val !== null ? " ghost" : "") + '" data-run="' + test.id + '">' +
        esc(val !== null ? t("a_again") : t("a_run")) + "</button></div>" +
        "</article>";
    }).join("") + "</div>";

    html += '<div id="stageHost" class="mt hide"></div>';

    // Session history
    html += '<section class="card mt"><h3>' + esc(t("res_t")) + "</h3>";
    if (!sessions.length) {
      html += '<div class="empty"><p>' + esc(t("not_enough")) + "</p></div>";
    } else {
      html += '<table><thead><tr><th>' + esc(t("check_t")) + "</th><th>" + esc(t("tr_baseline")) + "</th><th></th></tr></thead><tbody>";
      sessions.slice(-6).reverse().forEach(function (s) {
        html += "<tr><td><b>" + esc(t(testTitle(s.kind))) + "</b><br><span class=\"hint\">" + A().fmtDate(s.ts) + "</span></td><td>" +
          esc(summaryMetrics(s)) + "</td><td>" + (s.quality && s.quality.level === "high" ? '<span class="tag ok">' + esc(t("q_good")) + "</span>"
            : s.quality && s.quality.level === "fair" ? '<span class="tag warn">' + esc(t("q_fair")) + "</span>"
              : s.quality && s.quality.ok ? '<span class="tag warn">' + esc(t("q_fair")) + "</span>"
                : '<span class="tag bad">' + esc(t("q_low")) + "</span>") + "</td></tr>";
      });
      html += "</tbody></table>";
    }
    html += "</section>";

    return {
      html: html,
      mount: function () {
        document.querySelectorAll("[data-run]").forEach(function (b) {
          b.addEventListener("click", function () { start(b.getAttribute("data-run")); });
        });
      }
    };

    function start(kind) {
      if (active) active.cancel();
      var host = document.getElementById("stageHost");
      host.classList.remove("hide");
      host.scrollIntoView({ behavior: "smooth", block: "start" });
      if (kind === "tap") startTap(host);
      else if (kind === "speech") startSpeech(host);
      else if (kind === "balance") startBalance(host);
      else if (kind === "rt") startRT(host);
      else if (kind === "face") startFace(host);
    }
  }

  function testTitle(kind) { return { tap: "test_tap", speech: "test_speech", balance: "test_balance", rt: "test_rt", face: "test_face" }[kind] || "check_t"; }

  function primaryMetric(kind, session) {
    var m = session.metrics || {};
    if (kind === "tap" && m.tapRate) return m.tapRate + " " + t("m_tap_rate");
    if (kind === "speech" && m.speechRate) return m.speechRate + " " + t("m_speech_rate");
    if (kind === "balance" && m.swayRms) return m.swayRms + " mg";
    if (kind === "rt" && m.rtMedian) return m.rtMedian + " ms";
    if (kind === "face" && m.faceAsym !== undefined) return m.faceAsym + "%";
    return null;
  }

  function summaryMetrics(s) {
    var m = s.metrics || {};
    return Object.keys(m).filter(function (k) { return typeof m[k] === "number"; })
      .slice(0, 2).map(function (k) { return (M.METRIC_LABEL[k] ? t(M.METRIC_LABEL[k]) + " " : "") + m[k]; }).join(" · ");
  }

  function shell(titleKey, descKey, prepKey, body, hintKey) {
    return '<section class="card">' +
      '<div class="row between"><h2>' + esc(t(titleKey)) + '</h2><button class="btn ghost small" data-cancel>' + esc(t("a_cancel")) + "</button></div>" +
      '<p class="hint">' + esc(t(descKey)) + "</p>" +
      body +
      '<p class="hint mt-s">' + esc(t(prepKey)) + " · " + esc(t(hintKey)) + "</p></section>";
  }

  function startTap(host) {
    host.innerHTML = shell("test_tap", "test_tap_d", "prep_tap",
      '<div class="tapzone" id="tapPad" style="margin:14px 0"><b>' + esc(t("hint_tap")) + "</b></div>" +
      '<div class="row between"><span class="hint" id="tapTime">20.0s</span><span class="counter num" id="tapCount">0</span></div>',
      "hint_tap");

    var pad = document.getElementById("tapPad");
    active = S.runTap({
      el: pad, duration: 20000,
      onTick: function (s) {
        var c = document.getElementById("tapCount"), tm = document.getElementById("tapTime");
        if (c) c.textContent = s.taps;
        if (tm) tm.textContent = Math.max(0, 20 - s.elapsed).toFixed(1) + "s";
      }
    });
    active.promise.then(function (res) { finish("tap", host, res); });
    document.querySelector("[data-cancel]").addEventListener("click", function () { active.cancel(); });
  }

  function startSpeech(host) {
    host.innerHTML = shell("test_speech", "test_speech_d", "prep_speech",
      '<div class="stage" style="aspect-ratio:16/9"><div class="counter num" id="spCount">10</div>' +
      '<div class="sig"><span>MIC</span><b id="spLvl">0%</b></div></div>', "hint_speech");
    if (!A().ensureConsent("mic", function () { startSpeech(host); })) return;

    var start = Date.now();
    var cd = setInterval(function () {
      var el = document.getElementById("spCount");
      if (el) el.textContent = Math.max(0, 10 - Math.floor((Date.now() - start) / 1000));
    }, 250);

    active = S.runSpeech({
      duration: 10000,
      onLevel: function (v) {
        var el = document.getElementById("spLvl");
        if (el) el.textContent = Math.round(v * 100) + "%";
      }
    });
    active.promise.then(function (res) { clearInterval(cd); finish("speech", host, res); });
    document.querySelector("[data-cancel]").addEventListener("click", function () { clearInterval(cd); active.cancel(); });
  }

  function startBalance(host) {
    host.innerHTML = shell("test_balance", "test_balance_d", "prep_balance",
      '<div class="stage" style="aspect-ratio:16/9"><div class="counter num" id="bCount">20</div>' +
      '<div class="sig"><span>SWAY</span><b id="bSway">—</b></div></div>', "hint_balance");

    if (!S.motionSupported()) { finishBlocked(host, "sens_blocked"); return; }
    if (!A().ensureConsent("motion", function () { startBalance(host); })) return;

    S.requestMotion().then(function (ok) {
      if (!ok) { finishBlocked(host, "sens_blocked"); return; }
      var start = Date.now();
      var cd = setInterval(function () {
        var el = document.getElementById("bCount");
        if (el) el.textContent = Math.max(0, 20 - Math.floor((Date.now() - start) / 1000));
      }, 250);
      active = S.runBalance({
        duration: 20000,
        onTick: function (s) {
          var el = document.getElementById("bSway");
          if (el) el.textContent = (Math.abs(s.last || 0) * 1000).toFixed(0) + " mg";
        }
      });
      active.promise.then(function (res) { clearInterval(cd); finish("balance", host, res); });
      document.querySelector("[data-cancel]").addEventListener("click", function () { clearInterval(cd); active.cancel(); });
    });
  }

  function startRT(host) {
    host.innerHTML = shell("test_rt", "test_rt_d", "prep_rt",
      '<div class="stage" style="aspect-ratio:16/10;background:#060a18">' +
      '<div id="rtPrompt" class="hint" style="font-size:18px">' + esc(t("prep_rt")) + "</div>" +
      '<div id="rtPad" class="hide" style="position:absolute;inset:0;display:flex;gap:12px;padding:14px">' +
      '<button class="btn ghost" data-side="-1" style="flex:1;font-size:22px">◀</button>' +
      '<button class="btn ghost" data-side="1" style="flex:1;font-size:22px">▶</button>' +
      "</div></div>" +
      '<div class="row between mt-s"><span class="hint" id="rtProg">0 / 12</span><span class="hint num" id="rtLast">—</span></div>',
      "hint_rt");

    var lastRt = null;
    active = S.runRT({
      trials: 12,
      onTrial: function (s) {
        var prog = document.getElementById("rtProg");
        if (prog) prog.textContent = Math.min(s.index + 1, s.total) + " / " + s.total;
        var pad = document.getElementById("rtPad");
        var prompt = document.getElementById("rtPrompt");
        var last = document.getElementById("rtLast");
        if (!pad) return;
        if (s.phase === "go") {
          pad.classList.remove("hide");
          if (prompt) prompt.classList.add("hide");
          pad.querySelectorAll("[data-side]").forEach(function (b) {
            b.classList.toggle("live", Number(b.getAttribute("data-side")) === s.side);
          });
        } else {
          if (prompt && s.phase === "wait") {
            prompt.classList.remove("hide");
            prompt.textContent = "…";
          }
          pad.classList.add("hide");
        }
        if (s.phase === "gap" && s.last) {
          lastRt = s.last.rt;
          if (last) last.textContent = s.last.ok ? Math.round(s.last.rt) + " ms" : "×";
        }
      }
    });
    active.promise.then(function (res) { finish("rt", host, res); });
    host.querySelectorAll("[data-side]").forEach(function (b) {
      b.addEventListener("click", function () { active.answer(Number(b.getAttribute("data-side"))); });
    });
    document.querySelector("[data-cancel]").addEventListener("click", function () { active.cancel(); });
  }

  function startFace(host) {
    host.innerHTML = shell("test_face", "test_face_d", "prep_face",
      '<div class="stage"><video id="faceVid" playsinline muted autoplay></video><canvas id="faceCv" class="hide"></canvas>' +
      '<div class="face-oval"></div>' +
      '<div class="sig"><span>FACE</span><b id="faceSig">—</b></div></div>', "hint_face");
    if (!A().ensureConsent("camera", function () { startFace(host); })) return;

    var vid = document.getElementById("faceVid");
    var cv = document.getElementById("faceCv");
    active = S.runFace({
      video: vid, canvas: cv, duration: 8000,
      onStatus: function (s) {
        var el = document.getElementById("faceSig");
        if (!el) return;
        el.textContent = s.reduced ? "reduced" : s.face ? "OK" : "searching";
      }
    });
    active.promise.then(function (res) { finish("face", host, res); });
    document.querySelector("[data-cancel]").addEventListener("click", function () { active.cancel(); });
  }

  function finishBlocked(host, key) {
    host.innerHTML = '<section class="card"><div class="callout warn">' + esc(t(key)) + "</div>" +
      '<div class="btn-row"><button class="btn ghost" data-close-stage>' + esc(t("a_close")) + "</button></div></section>";
    var b = host.querySelector("[data-close-stage]");
    if (b) b.addEventListener("click", function () { host.classList.add("hide"); host.innerHTML = ""; });
  }

  function finish(kind, host, res) {
    active = null;
    if (!res || res.cancelled) { host.classList.add("hide"); host.innerHTML = ""; return; }
    if (res.error) {
      var key = /too_few/.test(res.error) ? "q_low"
        : /no_motion/.test(res.error) ? "sens_blocked"
          : /no_media|notfound/i.test(res.error) ? "sens_no_cam"
            : "sens_blocked";
      finishBlocked(host, key);
      return;
    }

    var st = A().store;
    var saved = null;
    if (res.quality && res.quality.ok) {
      saved = st.addSession({ kind: kind, metrics: res.metrics, quality: res.quality });
    }

    var UNITS = {
      tapRate: "/s", tapCv: "%", speechRate: "/s", f0Sd: " st", pauseRatio: "%", swayRms: " mg",
      rtMedian: " ms", rtCv: "%", rtErrors: "", faceAsym: "%", blinkRate: "/min"
    };
    var rows = Object.keys(res.metrics).filter(function (k) { return typeof res.metrics[k] === "number"; }).map(function (k) {
      return "<tr><td>" + esc(M.METRIC_LABEL[k] ? t(M.METRIC_LABEL[k]) : k) + "</td><td><b>" +
        res.metrics[k] + (UNITS[k] || "") + "</b></td></tr>";
    }).join("");

    var sessions = st.sessions();
    var cmp = "";
    if (saved) {
      var zs = M.METRICS.map(function (m) {
        var v = res.metrics[m.id];
        if (typeof v !== "number") return null;
        var z = M.zScore(sessions, m.id, v);
        return z === null ? null : { id: m.id, z: z };
      }).filter(Boolean);
      if (zs.length) {
        cmp = '<div class="drivers">' + zs.map(function (x) {
          var zc = Math.min(4, Math.abs(x.z));
          return '<span class="driver ' + (zc >= 2 ? "down" : "up") + '">' + esc(t(M.METRIC_LABEL[x.id])) + " " + zc.toFixed(1) + "σ</span>";
        }).join("") + "</div>";
      }
    }

    var q = res.quality || {};
    var lvl = q.level || "low";
    var chipStyle = lvl === "high" ? "green" : lvl === "fair" ? "amber" : "red";
    host.innerHTML = '<section class="card">' +
      '<div class="row between"><h2>' + esc(saved ? t("res_t") : t("q_low")) + "</h2>" +
      '<span class="chip ' + chipStyle + '">' + esc(lvl === "high" ? t("q_good") : lvl === "fair" ? t("q_fair") : t("q_low")) + "</span></div>" +
      "<table><tbody>" + rows + "</tbody></table>" + cmp +
      (saved ? '<p class="hint mt-s">' + esc(sessions.length >= 3 ? t("res_baseline_ok", { n: sessions.length }) : t("res_baseline_new", { n: sessions.length })) + "</p>" : "") +
      (res.reduced ? '<div class="callout warn mt-s">' + esc(t("sens_reduced")) + "</div>" : "") +
      '<div class="btn-row"><button class="btn" data-close-stage>' + esc(t("a_done")) + "</button>" +
      '<button class="btn ghost" data-retry="' + kind + '">' + esc(t("q_retry")) + "</button></div></section>";

    host.querySelector("[data-close-stage]").addEventListener("click", function () {
      host.classList.add("hide"); host.innerHTML = ""; A().rerender();
    });
    host.querySelector("[data-retry]").addEventListener("click", function () { A().rerender(); });
  }

  /* ---------------- clinician report ---------------- */

  function report(ctx) {
    var st = ctx.store;
    var data = st.load();
    var logs = st.lastNDays(28);
    var sessions = st.sessions();
    var dom = M.domains(logs, sessions, st.shiftDays, 7);
    var avg = M.factorAverages(logs, st.shiftDays, 28);
    var ins = M.insights({ logs: logs, sessions: sessions, today: st.dayKey(), shift: st.shiftDays });

    var rows = M.FACTORS.map(function (f) {
      var s = avg[f.id];
      return "<tr><td>" + esc(t("f_" + f.id)) + "</td><td>" + (s.value === null ? "—" : s.value) + "</td><td>" + s.n + "</td></tr>";
    }).join("");

    var sensorRows = sessions.slice(-6).map(function (s) {
      return "<tr><td>" + new Date(s.ts).toISOString().slice(0, 10) + "</td><td>" + esc(t(testTitle(s.kind))) + "</td><td>" + esc(summaryMetrics(s)) + "</td></tr>";
    }).join("");

    var insightRows = ins.slice(0, 5).map(function (i) {
      var vars = Object.assign({}, i.vars);
      if (vars.m && M.METRIC_LABEL[vars.m]) vars.m = t(M.METRIC_LABEL[vars.m]);
      return "<li><b>" + esc(t(i.titleKey, vars)) + ".</b> " + esc(t(i.bodyKey, vars)) + "</li>";
    }).join("");

    var html = '<section class="card no-print"><div class="row between">' +
      "<div><h2>" + esc(t("rp_t")) + '</h2><p class="hint">' + esc(t("rp_b")) + "</p></div>" +
      '<div class="btn-row" style="margin:0"><button class="btn" data-print>' + icon("print") + esc(t("a_print")) + "</button></div></div>" +
      '<p class="hint mt-s">' + esc(t("rp_print_hint")) + "</p></section>";

    html += '<div class="mt"><article class="report" id="reportSheet">' +
      '<div class="row between"><div><h1>BrainGuard Companion</h1>' +
      '<div class="rmeta">' + esc(t("rp_t")) + " · " + new Date().toISOString().slice(0, 10) + " · " + esc(t("local_only")) + "</div></div>" +
      '<img src="assets/mark.png" alt="" width="34" height="34" style="border-radius:8px"></div>' +

      '<h2>' + esc(t("bhi")) + "</h2>" +
      '<div class="kbox">' +
      "<div><span>" + esc(t("bhi")) + "</span><b>" + (dom.index === null ? "—" : dom.index) + "</b></div>" +
      "<div><span>" + esc(t("d_heart")) + "</span><b>" + (dom.heart.value === null ? "—" : dom.heart.value) + "</b></div>" +
      "<div><span>" + esc(t("d_sleep")) + "</span><b>" + (dom.sleep.value === null ? "—" : dom.sleep.value) + "</b></div>" +
      "<div><span>" + esc(t("d_mind")) + "</span><b>" + (dom.mind.value === null ? "—" : dom.mind.value) + "</b></div>" +
      "</div>" +
      '<p class="rmeta">' + esc(t("covered_days", { n: logs.length, d: 28 })) + " · " + sessions.length + " " + esc(t("d_tests")) + "</p>" +

      "<h2>" + esc(t("tr_factors")) + "</h2>" +
      "<table><thead><tr><th>" + esc(t("f_factor")) + "</th><th>0–100</th><th>" + esc(t("days")) + "</th></tr></thead><tbody>" + rows + "</tbody></table>" +

      (sensorRows ? "<h2>" + esc(t("tr_sensors")) + "</h2><table><thead><tr><th>Date</th><th>" + esc(t("check_t")) + "</th><th>" + esc(t("tr_28")) + "</th></tr></thead><tbody>" + sensorRows + "</tbody></table>" : "") +

      (insightRows ? "<h2>" + esc(t("sec_what_matters")) + "</h2><ul>" + insightRows + "</ul>" : "") +

      "<h2>" + esc(t("pv_t")) + "</h2>" +
      "<p>" + esc(t("pv_b")) + " " + esc(t("foot_disclaimer")) + "</p>" +
      "</article></div>";

    return {
      html: html,
      mount: function () {
        var b = document.querySelector("[data-print]");
        if (b) b.addEventListener("click", function () { window.print(); });
      }
    };
  }

  /* ---------------- privacy ---------------- */

  var COUNTRIES = [
    ["MY", "Malaysia", "999"], ["SG", "Singapore", "995"], ["ID", "Indonesia", "119"], ["TH", "Thailand", "1669"],
    ["PH", "Philippines", "911"], ["VN", "Vietnam", "115"], ["BN", "Brunei", "991"], ["IN", "India", "112"],
    ["CN", "China", "120"], ["HK", "Hong Kong", "999"], ["JP", "Japan", "119"], ["KR", "South Korea", "119"],
    ["AU", "Australia", "000"], ["NZ", "New Zealand", "111"], ["GB", "United Kingdom", "999"], ["IE", "Ireland", "112"],
    ["US", "United States", "911"], ["CA", "Canada", "911"], ["AE", "United Arab Emirates", "998"], ["SA", "Saudi Arabia", "997"],
    ["QA", "Qatar", "999"], ["KW", "Kuwait", "112"], ["BH", "Bahrain", "999"], ["JO", "Jordan", "911"],
    ["LB", "Lebanon", "140"], ["ZA", "South Africa", "10177"], ["DE", "Germany", "112"], ["FR", "France", "15"],
    ["ES", "Spain", "112"], ["IT", "Italy", "118"], ["NL", "Netherlands", "112"], ["BE", "Belgium", "112"],
    ["PT", "Portugal", "112"], ["GR", "Greece", "166"], ["PL", "Poland", "999"], ["SE", "Sweden", "112"],
    ["NO", "Norway", "113"], ["DK", "Denmark", "112"], ["FI", "Finland", "112"], ["CH", "Switzerland", "144"],
    ["AT", "Austria", "144"], ["TR", "Turkey", "112"], ["IL", "Israel", "101"], ["RU", "Russia", "112"],
    ["UA", "Ukraine", "112"], ["KZ", "Kazakhstan", "112"], ["BR", "Brazil", "192"], ["MX", "Mexico", "911"],
    ["AR", "Argentina", "911"], ["CL", "Chile", "131"], ["CO", "Colombia", "123"], ["PE", "Peru", "117"],
    ["EG", "Egypt", "123"], ["NG", "Nigeria", "112"], ["KE", "Kenya", "999"], ["PK", "Pakistan", "1122"],
    ["BD", "Bangladesh", "999"], ["LK", "Sri Lanka", "1990"], ["NP", "Nepal", "102"], ["TW", "Taiwan", "119"],
    ["MO", "Macau", "999"], ["MT", "Malta", "112"]
  ];

  function countryRow(code) {
    for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i][0] === code) return COUNTRIES[i];
    return COUNTRIES[0];
  }

  function privacy(ctx) {
    var st = ctx.store;
    var data = st.load();
    var kb = (st.bytes() / 1024).toFixed(1);

    var sw = function (key, title, desc) {
      return '<div class="switch"><div class="txt"><b>' + esc(t(title)) + "</b><span>" + esc(t(desc)) + "</span></div>" +
        '<button class="toggle" role="switch" aria-checked="' + (!!data.consent[key]) + '" data-consent="' + key + '" aria-label="' + esc(t(title)) + '"></button></div>';
    };

    var html = '<section class="card"><h2>' + esc(t("pv_t")) + '</h2><p class="hint">' + esc(t("pv_b")) + "</p>" +
      '<div class="callout info mt">' + icon("shield") + " " + esc(t("pv_on_device")) + "</div>" +
      '<div class="grid g3 mt">' +
      kpiBox(t("k_logged"), Object.keys(data.logs).length) +
      kpiBox(t("k_tests"), data.sessions.length) +
      kpiBox("KB", kb) +
      "</div></section>";

    html += '<section class="card"><h3>' + esc(t("pv_consent")) + "</h3>" +
      sw("camera", "pv_cam", "pv_cam_d") + sw("mic", "pv_mic", "pv_mic_d") + sw("motion", "pv_motion", "pv_motion_d") + "</section>";

    html += '<section class="card"><h3>' + esc(t("pv_arch")) + "</h3>" +
      '<svg viewBox="0 0 560 150" style="width:100%">' +
      '<rect x="10" y="34" width="200" height="82" rx="12" fill="rgba(91,214,200,.1)" stroke="rgba(91,214,200,.4)"/>' +
      '<text x="110" y="66" text-anchor="middle" fill="#dff7f4" font-size="12">Log · sensors · plan</text>' +
      '<text x="110" y="88" text-anchor="middle" fill="#8f9ac4" font-size="10">localStorage on this device</text>' +
      '<rect x="250" y="34" width="120" height="82" rx="12" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.16)"/>' +
      '<text x="310" y="70" text-anchor="middle" fill="#c3cbe8" font-size="11">on-device</text>' +
      '<text x="310" y="88" text-anchor="middle" fill="#8f9ac4" font-size="10">scoring</text>' +
      '<rect x="410" y="34" width="140" height="82" rx="12" fill="rgba(232,86,79,.08)" stroke="rgba(232,86,79,.3)" stroke-dasharray="5 4"/>' +
      '<text x="480" y="70" text-anchor="middle" fill="#ffc9c5" font-size="11">no server</text>' +
      '<text x="480" y="88" text-anchor="middle" fill="#8f9ac4" font-size="10">no account</text>' +
      '<path d="M210 75h40M370 75h40" stroke="rgba(255,255,255,.25)" stroke-dasharray="4 4"/>' +
      "</svg>" +
      '<p class="hint">' + esc(t("pv_retention")) + "</p></section>";

    html += '<section class="card"><h3>' + esc(t("pv_data")) + "</h3>" +
      '<div class="btn-row" style="margin-top:4px">' +
      '<button class="btn ghost" data-export>' + icon("download") + esc(t("pv_export")) + "</button>" +
      '<button class="btn ghost" data-import>' + icon("download") + esc(t("pv_import")) + "</button>" +
      '<button class="btn danger" data-wipe>' + icon("trash") + esc(t("pv_delete")) + "</button>" +
      "</div>" +
      '<input type="file" id="importFile" accept="application/json" class="hide">' +
      "</section>";

    return {
      html: html,
      mount: function () {
        var view = document.getElementById("view");
        view.querySelectorAll("[data-consent]").forEach(function (b) {
          b.addEventListener("click", function () {
            var k = b.getAttribute("data-consent");
            var next = b.getAttribute("aria-checked") !== "true";
            b.setAttribute("aria-checked", next ? "true" : "false");
            ctx.store.setConsent(k, next);
          });
        });
        view.querySelector("[data-export]").addEventListener("click", function () {
          var blob = new Blob([ctx.store.exportJSON()], { type: "application/json" });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "brainguard-" + ctx.store.dayKey() + ".json";
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
          A().toast(t("exported"));
        });
        view.querySelector("[data-import]").addEventListener("click", function () {
          document.getElementById("importFile").click();
        });
        document.getElementById("importFile").addEventListener("change", function (e) {
          var f = e.target.files[0];
          if (!f) return;
          var r = new FileReader();
          r.onload = function () {
            try {
              ctx.store.importJSON(String(r.result));
              A().toast(t("saved"));
              A().rerender();
            } catch (err) { A().toast(t("error")); }
          };
          r.readAsText(f);
        });
        view.querySelector("[data-wipe]").addEventListener("click", function () {
          A().confirm(t("pv_delete_q"), t("pv_delete_b"), t("a_delete"), function () {
            ctx.store.wipe();
            A().toast(t("deleted"));
            location.hash = "#/today";
            A().rerender();
          });
        });
      }
    };
  }

  function kpiBox(label, value) {
    return '<div class="kpi"><div class="k">' + esc(label) + '</div><div class="v">' + esc(value) + "</div></div>";
  }

  /* ---------------- emergency ---------------- */

  function emergency(ctx) {
    var st = ctx.store;
    var code = st.load().profile.country || "MY";
    var row = countryRow(code);
    var options = COUNTRIES.map(function (c) {
      return '<option value="' + c[0] + '"' + (c[0] === code ? " selected" : "") + ">" + esc(c[1]) + " · " + esc(c[2]) + "</option>";
    }).join("");

    var html = '<section class="card" style="border-color:rgba(232,86,79,.45);background:linear-gradient(180deg,rgba(232,86,79,.14),rgba(20,26,68,.92))">' +
      '<div class="row between"><h2 style="font-size:20px">' + esc(t("em_t")) + "</h2>" + icon("alert", "danger") + "</div>" +
      '<p class="hint" style="color:#ffd2cf">' + esc(t("em_b")) + "</p>" +
      '<div class="field mt"><label for="emCountry">' + esc(t("em_local")) + "</label><select id=\"emCountry\">" + options + "</select></div>" +
      '<a class="btn lg block" href="tel:' + esc(row[2]) + '" style="text-decoration:none;margin-top:6px">' + esc(t("em_call")) + " · " + esc(row[2]) + "</a>" +
      "</section>";

    html += '<section class="card"><h3>' + esc(t("em_signs")) + "</h3>" +
      '<p style="font-size:14.5px;line-height:1.7">' + esc(t("em_signs_b")) + "</p>" +
      '<div class="callout warn mt">' + esc(t("em_note")) + "</div></section>";

    html += '<section class="card"><h3>BE-FAST</h3>' +
      '<div class="grid g2">' +
      [["B", "Balance"], ["E", "Eyes"], ["F", "Face"], ["A", "Arms"], ["S", "Speech"], ["T", "Time"]].map(function (x) {
        return '<div class="kpi"><div class="k" style="font-size:16px;color:var(--teal)">' + x[0] + '</div><div class="d" style="font-size:13px;color:var(--ink-2)">' + x[1] + "</div></div>";
      }).join("") + "</div></section>";

    html += '<section class="card"><h3>' + esc(t("nav_check")) + "</h3>" +
      '<p class="hint">' + esc(t("check_why")) + "</p>" +
      '<div class="btn-row"><button class="btn ghost" data-go="check">' + esc(t("nav_check")) + "</button>" +
      '<a class="btn ghost" href="https://da3r68yc.qwenwork.page/" target="_blank" rel="noopener">BrainGuard AI · clinical</a></div></section>';

    return {
      html: html,
      mount: function () {
        var sel = document.getElementById("emCountry");
        if (sel) sel.addEventListener("change", function () {
          st.setProfile({ country: sel.value });
          A().rerender();
        });
      }
    };
  }

  root.BGViews2 = { check: check, report: report, privacy: privacy, emergency: emergency, COUNTRIES: COUNTRIES, countryRow: countryRow };
})(typeof self !== "undefined" ? self : this);
