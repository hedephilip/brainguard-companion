/* BrainGuard Companion — views, part 1
   Today, daily log, weekly plan, trends. */
(function (root) {
  "use strict";

  var M = root.BGModel;

  function A() { return root.BG; }
  function t(k, vars) { return A().t(k, vars); }
  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function icon(id, cls) { return '<svg class="ic ' + (cls || "") + '" aria-hidden="true"><use href="#i-' + id + '"/></svg>'; }
  function sevChip(sev) {
    var map = { good: ["green", "sev_info"], info: ["teal", "sev_info"], watch: ["amber", "sev_watch"], act: ["red", "sev_act"], urgent: ["red", "sev_emergency"] };
    var m = map[sev] || map.info;
    return '<span class="chip ' + m[0] + '">' + esc(t(m[1])) + "</span>";
  }
  function pct(v) { return v === null || v === undefined ? "—" : Math.round(v); }

  /* ---------------- charts ---------------- */

  function ring(value, opts) {
    var o = opts || {};
    var size = o.size || 168, stroke = o.stroke || 12;
    var r = (size - stroke) / 2;
    var c = 2 * Math.PI * r;
    var v = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
    var dash = (v / 100) * c;
    var col = value === null ? "#3a4373" : v >= 70 ? "var(--teal)" : v >= 50 ? "var(--amber)" : "var(--coral)";
    return '<div class="ring" style="width:' + size + "px;height:" + size + 'px">' +
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + " " + size + '">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="' + stroke + '"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="' + stroke +
      '" stroke-linecap="round" stroke-dasharray="' + dash.toFixed(1) + " " + c.toFixed(1) + '"/>' +
      "</svg>" +
      '<div class="ring-c"><div class="ring-v">' + (value === null ? "—" : Math.round(value)) + "</div>" +
      '<div class="ring-l">' + esc(o.label || t("bhi")) + "</div></div></div>";
  }

  function areaChart(series, opts) {
    var o = opts || {};
    var w = o.width || 560, hgt = o.height || 130, pad = 8;
    if (!series || series.length < 2) return '<p class="hint">' + esc(t("tr_empty")) + "</p>";
    var vals = series.map(function (p) { return p.v; });
    var min = o.min !== undefined ? o.min : Math.min.apply(null, vals);
    var max = o.max !== undefined ? o.max : Math.max.apply(null, vals);
    if (max - min < 1) { max = min + 1; }
    var span = max - min;
    var stepX = (w - pad * 2) / Math.max(1, series.length - 1);
    var pts = series.map(function (p, i) {
      var x = pad + i * stepX;
      var y = pad + (hgt - pad * 2) * (1 - (p.v - min) / span);
      return [x, y];
    });
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    var area = line + " L" + pts[pts.length - 1][0].toFixed(1) + " " + (hgt - pad) + " L" + pts[0][0].toFixed(1) + " " + (hgt - pad) + " Z";
    var id = "g" + Math.random().toString(36).slice(2, 7);
    return '<svg class="chart" viewBox="0 0 ' + w + " " + hgt + '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + (o.color || "#5bd6c8") + '" stop-opacity=".34"/>' +
      '<stop offset="100%" stop-color="' + (o.color || "#5bd6c8") + '" stop-opacity="0"/></linearGradient></defs>' +
      [0.25, 0.5, 0.75].map(function (f) {
        return '<line class="grid-l" x1="0" y1="' + (pad + (hgt - pad * 2) * f).toFixed(1) + '" x2="' + w + '" y2="' + (pad + (hgt - pad * 2) * f).toFixed(1) + '"/>';
      }).join("") +
      '<path d="' + area + '" fill="url(#' + id + ')"/>' +
      '<path class="ln" d="' + line + '" stroke="' + (o.color || "#5bd6c8") + '"/>' +
      "</svg>";
  }

  function spark(values) {
    if (!values.length) return '<div class="spark">' + new Array(14).fill('<i style="height:2px;opacity:.25"></i>').join("") + "</div>";
    var max = Math.max.apply(null, values.concat([1]));
    var cells = values.slice(-14);
    while (cells.length < 14) cells.unshift(null);
    return '<div class="spark">' + cells.map(function (v) {
      if (v === null) return '<i style="height:2px;opacity:.18"></i>';
      var hgt = Math.max(4, Math.round((v / max) * 34));
      var cls = v >= 70 ? "hi" : v < 45 ? "lo" : "";
      return '<i class="' + cls + '" style="height:' + hgt + 'px"></i>';
    }).join("") + "</div>";
  }

  function shortDomain(key) {
    var pack = root.BG_I18N[A().lang()] || root.BG_I18N.en;
    if (pack["d_" + key + "_short"]) return pack["d_" + key + "_short"];
    var s = t("d_" + key);
    var cut = s.split(/\s*&\s*|\s+dan\s+|\s+y\s+|与|和/)[0];
    return cut.length > 14 ? cut.slice(0, 13) + "…" : cut;
  }

  function radar(domains) {
    var keys = ["heart", "sleep", "mind", "senses", "motion"];
    var size = 300, cx = size / 2, cy = size / 2, R = 82;
    function pt(i, frac) {
      var ang = (Math.PI * 2 * i) / keys.length - Math.PI / 2;
      return [cx + Math.cos(ang) * R * frac, cy + Math.sin(ang) * R * frac];
    }
    function polygon(fracFn) {
      return keys.map(function (k, i) { return pt(i, fracFn(k)).map(function (n) { return n.toFixed(1); }).join(","); }).join(" ");
    }
    var grid = [0.33, 0.66, 1].map(function (f) {
      return '<polygon points="' + polygon(function () { return f; }) + '" fill="none" stroke="rgba(255,255,255,.09)"/>';
    }).join("");
    var labels = keys.map(function (k, i) {
      var p = pt(i, 1.28);
      var anchor = Math.abs(p[0] - cx) < 14 ? "middle" : p[0] > cx ? "start" : "end";
      if (anchor === "start") p[0] -= 2;
      if (anchor === "end") p[0] += 2;
      return '<text x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" text-anchor="' + anchor + '" class="axis" dominant-baseline="middle" font-size="10">' + esc(shortDomain(k)) + "</text>";
    }).join("");
    var shape = '<polygon points="' + polygon(function (k) { var d = domains[k]; return Math.max(0.08, (d && d.value ? d.value : 0) / 100); }) +
      '" fill="rgba(91,214,200,.18)" stroke="var(--teal)" stroke-width="2"/>';
    return '<svg viewBox="0 0 ' + size + " " + size + '" style="width:100%;max-width:320px;overflow:visible">' +
      grid + shape + labels + "</svg>";
  }

  /* ---------------- insight card ---------------- */

  function metricLabel(m) {
    var key = M.METRIC_LABEL[m];
    return key ? t(key) : m;
  }

  function insightCard(ins) {
    var vars = Object.assign({}, ins.vars);
    if (vars.m && M.METRIC_LABEL[vars.m]) vars.m = metricLabel(vars.m);
    var drivers = (ins.drivers || []).map(function (d) {
      return '<span class="driver ' + (d.dir > 0 ? "up" : "down") + '">' + esc(t(d.key)) + (d.dir > 0 ? " +" : " −") + "</span>";
    }).join("");
    var ev = (ins.evidence || []).map(function (e) { return "<span>" + esc(e) + "</span>"; }).join("");
    return '<article class="insight ' + ins.sev + '">' +
      '<div class="ih"><b>' + esc(t(ins.titleKey, vars)) + "</b><span class=\"sev\">" + sevChip(ins.sev) + "</span></div>" +
      "<p>" + esc(t(ins.bodyKey, vars)) + "</p>" +
      (drivers ? '<div class="drivers">' + drivers + "</div>" : "") +
      '<details class="explain"><summary>' + esc(t("why_show")) + "</summary>" +
      '<div class="body">' +
      esc(t("confidence")) + ": " + esc(t(ins.confidence === "high" ? "conf_high" : ins.confidence === "mid" ? "conf_mid" : "conf_low")) +
      " · " + esc(t("data_n", { n: ins.n })) +
      "</div>" +
      (ev ? '<div class="evidence">' + ev + "</div>" : "") +
      "</details></article>";
  }

  function referral(ins) {
    var r = M.referral(ins);
    if (r.level === "now") {
      return '<div class="callout danger"><b>' + esc(t("ref_now")) + "</b><br>" +
        '<button class="btn danger" data-go="emergency" style="margin-top:10px">' + esc(t("em_call")) + "</button></div>";
    }
    if (r.level === "soon") {
      return '<div class="callout warn">' + esc(t("ref_soon")) + ' <a href="#/report">' + esc(t("rp_t")) + "</a></div>";
    }
    if (r.level === "watch") return '<div class="callout info">' + esc(t("ref_watch")) + "</div>";
    if (r.level === "routine") return '<div class="callout info">' + esc(t("ref_routine")) + "</div>";
    return "";
  }

  /* ---------------- today ---------------- */

  function today(ctx) {
    var st = ctx.store;
    var data = st.load();
    var logs = st.lastNDays(28);
    var todayLog = st.getLog(st.dayKey());
    var sessions = st.sessions();
    var dom = M.domains(logs, sessions, st.shiftDays, 7);
    var ins = M.insights({ logs: logs, sessions: sessions, today: st.dayKey(), shift: st.shiftDays });
    var avg = M.factorAverages(logs, st.shiftDays, 7);
    var plan = data.plan && data.plan.weekStart === M.weekStart(st.dayKey()) ? data.plan : null;
    if (!plan && logs.length) {
      plan = M.buildPlan({ logs: logs, today: st.dayKey(), shift: st.shiftDays }, data.plan);
      st.setPlan(plan);
    }

    var hour = new Date().getHours();
    var greet = hour < 12 ? t("g_morning") : hour < 18 ? t("g_afternoon") : t("g_evening");

    var heroTitle = todayLog ? t("hero_done_t") : t("hero_todo_t");
    var heroBody = todayLog ? t("hero_done_b") : t("hero_todo_b");

    var html = "";

    if (data.profile.demo) {
      html += '<div class="callout info" style="display:flex;justify-content:space-between;gap:14px;align-items:center;margin-bottom:14px">' +
        "<span>" + esc(t("demo_note")) + '</span><button class="btn ghost small" data-demo-clear style="flex:none">' +
        esc(t("demo_clear")) + "</button></div>";
    }

    html += '<section class="hero">' +
      "<div>" +
      '<div class="eyebrow">' + esc(greet) + "</div>" +
      "<h2>" + esc(heroTitle) + "</h2>" +
      '<p class="lead">' + esc(heroBody) + "</p>" +
      '<div class="btn-row next">' +
      '<button class="btn lg" data-go="log">' + esc(todayLog ? t("cta_edit_log") : t("cta_log")) + "</button>" +
      '<button class="btn ghost" data-go="check">' + esc(t("nav_check")) + "</button>" +
      "</div></div>" +
      '<div class="hero-right">' + ring(dom.index, { label: t("k_bhi"), size: window.innerWidth < 860 ? 150 : 176 }) + "</div>" +
      "</section>";

    var logged = logs.length;
    html += '<div class="kpis">' +
      kpi(t("k_streak"), st.streak(), t("d_streak")) +
      kpi(t("k_logged"), logged, t("d_logged")) +
      kpi(t("k_bhi"), dom.index === null ? "—" : dom.index, t("d_bhi")) +
      kpi(t("k_tests"), sessions.length, t("d_tests")) +
      "</div>";

    html += referral(ins);

    html += '<div class="grid g2 mt">' +
      '<section class="card"><h3>' + esc(t("sec_what_matters")) + "</h3>" +
      (ins.length ? ins.slice(0, 4).map(insightCard).join("") :
        '<div class="empty">' + icon("info") + "<p>" + esc(t("insight_none_b")) + "</p>" +
        '<button class="btn ghost" data-demo>' + esc(t("demo_load")) + "</button></div>") +
      "</section>";

    // Domain breakdown
    html += '<section class="card"><h3>' + esc(t("bhi")) + "</h3>" +
      '<p class="hint">' + esc(t("bhi_note")) + "</p>" +
      '<div style="display:flex;justify-content:center;margin:6px 0 2px">' + radar(dom) + "</div>" +
      '<div class="mt-s">' + ["heart", "sleep", "mind", "senses", "motion"].map(function (k) {
        var d = dom[k];
        return '<div class="factor-row"><div class="nm">' + esc(t("d_" + k)) + '</div><div class="bar"><i style="width:' +
          (d && d.value !== null ? d.value : 0) + '%"></i></div><div class="val">' + (d && d.value !== null ? d.value : "—") + "</div></div>";
      }).join("") + "</div></section></div>";

    // Plan preview
    html += '<div class="grid g2 mt">' +
      '<section class="card"><h3>' + esc(t("sec_this_week")) + "</h3>" +
      (plan && plan.items.length ? plan.items.slice(0, 3).map(planRow).join("") +
        '<div class="btn-row"><button class="btn ghost" data-go="plan">' + esc(t("nav_plan")) + "</button></div>" :
        '<div class="empty"><p>' + esc(t("pl_empty")) + "</p></div>") +
      "</section>";

    // Patterns
    html += '<section class="card"><h3>' + esc(t("sec_patterns")) + "</h3>" +
      [["sleep", t("f_sleep")], ["move", t("f_move")], ["bp", t("f_bp")]].map(function (pair) {
        var s = avg[pair[0]];
        return '<div style="margin-bottom:12px"><div class="row between"><span class="hint">' + esc(pair[1]) + "</span><span class=\"hint num\">" +
          (s.value === null ? "—" : s.value) + "</span></div>" + spark(s.series.map(function (p) { return p.v; })) + "</div>";
      }).join("") +
      '<div class="btn-row"><button class="btn ghost" data-go="trends">' + esc(t("nav_trends")) + "</button></div></section></div>";

    // Baseline due
    var lastS = sessions.length ? sessions[sessions.length - 1].ts : 0;
    var due = !lastS || (Date.now() - lastS) > 25 * 86400000;
    html += '<section class="card mt"><div class="row between">' +
      '<div style="max-width:52ch"><h3 style="margin-bottom:4px">' + esc(t("sec_lab")) + "</h3>" +
      "<b>" + esc(t("lab_cta_t")) + "</b><p class=\"hint\" style=\"margin-top:6px\">" + esc(t("lab_cta_b")) + "</p></div>" +
      '<div class="right"><span class="pill ' + (due ? "amber" : "quiet") + '">' + esc(due ? t("lab_due") : t("d_tests") + " " + sessions.length) + "</span>" +
      '<div class="btn-row"><button class="btn" data-go="check">' + esc(t("test_tap")) + " + 4</button></div></div>" +
      "</div></section>";

    return { html: html };
  }

  function kpi(label, value, sub) {
    return '<div class="kpi"><div class="k">' + esc(label) + '</div><div class="v">' + esc(value) + '</div><div class="d">' + esc(sub) + "</div></div>";
  }

  function planRow(it) {
    return '<div class="plan-item' + (it.done ? " done" : "") + '" data-plan="' + esc(it.id) + '">' +
      '<button class="box" data-plan-toggle="' + esc(it.id) + '" aria-pressed="' + (!!it.done) + '">' + (it.done ? icon("check") : "") + "</button>" +
      '<div class="txt"><b>' + esc(t(it.key)) + "</b><span>" + esc(t("pl_evidence")) + ": " + esc(it.ev) + "</span></div></div>";
  }

  /* ---------------- daily log ---------------- */

  var DRAFT = null;

  function draftFrom(data) {
    return {
      sleepH: data && data.sleepH !== undefined ? data.sleepH : "",
      sleepQ: data && data.sleepQ ? data.sleepQ : "",
      stress: data && data.stress !== undefined && data.stress !== null ? data.stress : "",
      mood: data && data.mood ? data.mood : "",
      moveMin: data && data.moveMin !== undefined ? data.moveMin : "",
      moveType: data && data.moveType ? data.moveType : "",
      bpSys: data && data.bpSys ? data.bpSys : "",
      bpDia: data && data.bpDia ? data.bpDia : "",
      smoke: data && data.smoke ? data.smoke : "",
      alcohol: data && data.alcohol ? data.alcohol : "",
      dietVeg: data && data.dietVeg !== undefined ? data.dietVeg : "",
      dietFried: data && data.dietFried !== undefined ? data.dietFried : "",
      dietSalt: data && data.dietSalt !== undefined ? data.dietSalt : "",
      connect: data && data.connect ? data.connect : "",
      hear: data && data.hear ? data.hear : "",
      vision: data && data.vision ? data.vision : "",
      mindDays: data && data.mindDays !== undefined ? data.mindDays : ""
    };
  }

  function seg(field, value, options) {
    return '<div class="seg" data-seg="' + field + '">' + options.map(function (o) {
      return '<button type="button" data-set="' + field + '" data-val="' + o[0] + '" aria-pressed="' +
        (String(value) === String(o[0]) ? "true" : "false") + '">' + esc(o[1]) + "</button>";
    }).join("") + "</div>";
  }

  function numField(field, value, label, ph, suffix) {
    return '<div class="field"><label for="f_' + field + '">' + esc(label) + "</label>" +
      '<input id="f_' + field + '" type="number" inputmode="decimal" data-field="' + field + '" value="' + esc(value) +
      '" placeholder="' + esc(ph || "") + '"' + (suffix ? "" : "") + ">" + (suffix ? '<div class="why">' + esc(suffix) + "</div>" : "") + "</div>";
  }

  function textField(field, value, label, ph) {
    return '<div class="field"><label for="f_' + field + '">' + esc(label) + "</label>" +
      '<input id="f_' + field + '" type="text" data-field="' + field + '" value="' + esc(value) + '" placeholder="' + esc(ph || "") + '"></div>';
  }

  function log(ctx) {
    var st = ctx.store;
    var d = st.getLog(st.dayKey());
    if (!DRAFT) DRAFT = draftFrom(d);
    var v = DRAFT;

    var html = "";
    html += '<section class="card"><div class="row between">' +
      "<div><h2>" + esc(t("log_t")) + '</h2><p class="hint">' + esc(t("log_b")) + "</p></div>" +
      '<span class="pill quiet">' + esc(t("log_60s")) + "</span></div></section>";

    html += '<section class="card mt"><h3>' + esc(t("d_sleep")) + "</h3>" +
      '<div class="two">' +
      numField("sleepH", v.sleepH, t("q_sleep_h"), "7.5") +
      '<div class="field"><span class="flabel">' + esc(t("q_sleep_q")) + "</span>" +
      seg("sleepQ", v.sleepQ, [["1", t("s_poor")], ["2", t("s_fair")], ["3", t("s_ok")], ["4", t("s_good")], ["5", t("s_great")]]) + "</div>" +
      "</div>" +
      '<div class="field"><span class="flabel">' + esc(t("q_stress")) + ' <span class="hint">0–10</span></span>' +
      '<input type="range" min="0" max="10" step="1" id="stressRange" data-field="stress" value="' + esc(v.stress === "" ? 4 : v.stress) + '">' +
      '<div class="row between"><span class="hint">0</span><span class="hint num" id="stressVal">' + esc(v.stress === "" ? 4 : v.stress) + "</span><span class=\"hint\">10</span></div></div>" +
      '<div class="field"><span class="flabel">' + esc(t("q_mood")) + "</span>" +
      seg("mood", v.mood, [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]]) + "</div></section>";

    html += '<section class="card"><h3>' + esc(t("d_heart")) + "</h3>" +
      '<div class="two">' + numField("moveMin", v.moveMin, t("q_move"), "30") +
      textField("moveType", v.moveType, t("q_move_type"), "walk, cycle…") + "</div>" +
      '<div class="field"><span class="flabel">' + esc(t("q_bp")) + ' <span class="hint">· ' + esc(t("optional")) + "</span></span>" +
      '<div class="bp-row">' + numField("bpSys", v.bpSys, t("q_bp_sys"), "120") + numField("bpDia", v.bpDia, t("q_bp_dia"), "80") + "</div></div>" +
      '<div class="two"><div class="field"><span class="flabel">' + esc(t("q_smoke")) + "</span>" +
      seg("smoke", v.smoke, [["none", t("sm_none")], ["occ", t("sm_occ")], ["daily", t("sm_daily")]]) + "</div>" +
      '<div class="field"><span class="flabel">' + esc(t("q_alcohol")) + "</span>" +
      seg("alcohol", v.alcohol, [["none", t("al_0")], ["low", t("al_low")], ["mid", t("al_mid")], ["high", t("al_high")]]) + "</div></div>" +
      '<div class="field"><span class="flabel">' + esc(t("q_diet")) + "</span>" +
      '<div class="three">' +
      dietCol("dietVeg", v.dietVeg, t("q_diet_veg")) +
      dietCol("dietFried", v.dietFried, t("q_diet_fried")) +
      dietCol("dietSalt", v.dietSalt, t("q_diet_salt")) +
      "</div></div></section>";

    html += '<section class="card"><h3>' + esc(t("d_mind")) + "</h3>" +
      '<div class="field"><span class="flabel">' + esc(t("q_connect")) + "</span>" +
      seg("connect", v.connect, [["daily", t("cn_daily")], ["weekly", t("cn_weekly")], ["rare", t("cn_rare")], ["never", t("cn_never")]]) + "</div>" +
      '<div class="two"><div class="field"><span class="flabel">' + esc(t("q_hear")) + "</span>" +
      seg("hear", v.hear, [["no", t("hear_no")], ["some", t("hear_some")], ["yes", t("hear_yes")]]) + "</div>" +
      '<div class="field"><span class="flabel">' + esc(t("q_vision")) + "</span>" +
      seg("vision", v.vision, [["no", t("vis_no")], ["some", t("vis_some")], ["yes", t("vis_yes")]]) + "</div></div>" +
      numField("mindDays", v.mindDays, t("q_mind") + " · " + t("q_new_learning"), "2") +
      "</section>";

    html += '<div class="btn-row"><button class="btn lg" data-save-log>' + icon("check") + esc(t("a_save")) + "</button>" +
      '<button class="btn ghost" data-go="today">' + esc(t("a_cancel")) + "</button></div>";

    return {
      html: html,
      mount: function () {
        var view = document.getElementById("view");
        view.querySelectorAll("[data-set]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var f = btn.getAttribute("data-set");
            DRAFT[f] = btn.getAttribute("data-val");
            view.querySelectorAll('[data-seg="' + f + '"] [data-set]').forEach(function (b) {
              b.setAttribute("aria-pressed", b === btn ? "true" : "false");
            });
          });
        });
        view.querySelectorAll("[data-field]").forEach(function (inp) {
          inp.addEventListener("input", function () {
            DRAFT[inp.getAttribute("data-field")] = inp.value;
            if (inp.id === "stressRange") {
              var out = document.getElementById("stressVal");
              if (out) out.textContent = inp.value;
            }
          });
        });
        var save = view.querySelector("[data-save-log]");
        if (save) save.addEventListener("click", function () { ctx.saveLog(DRAFT); });
      }
    };
  }

  function dietCol(field, value, label) {
    return '<div><span class="hint" style="display:block;margin-bottom:6px">' + esc(label) + "</span>" +
      seg(field, value, [["never", t("diet_never")], ["once", t("diet_once")], ["twice", t("diet_twice")]]) + "</div>";
  }

  /* ---------------- plan ---------------- */

  function plan(ctx) {
    var st = ctx.store;
    var data = st.load();
    var p = data.plan;
    if (!p || p.weekStart !== M.weekStart(st.dayKey())) {
      p = M.buildPlan({ logs: st.lastNDays(14), today: st.dayKey(), shift: st.shiftDays }, p);
      st.setPlan(p);
    }
    var done = p.items.filter(function (i) { return i.done; }).length;
    var prog = p.items.length ? Math.round((done / p.items.length) * 100) : 0;

    var html = '<section class="card"><div class="row between">' +
      "<div><h2>" + esc(t("pl_t")) + "</h2><p class=\"hint\">" + esc(t("pl_b")) + "</p></div>" +
      '<span class="pill quiet">' + esc(t("pl_week", { d: A().fmtDate(new Date(p.weekStart + "T00:00:00")) })) + "</span></div>" +
      '<div class="mt"><div class="row between"><span class="hint">' + esc(t("pl_done", { n: done, m: p.items.length })) + "</span><span class=\"hint num\">" + prog + "%</span></div>" +
      '<div class="bar mt-s"><i style="width:' + prog + '%"></i></div></div>' +
      '<div class="mt">' + p.items.map(planRow).join("") + "</div>" +
      '<div class="btn-row"><button class="btn ghost" data-plan-rebuild>' + esc(t("pl_new")) + "</button>" +
      '<button class="btn ghost" data-go="log">' + esc(t("nav_log")) + "</button></div></section>";

    html += '<section class="card"><h3>' + esc(t("pl_evidence")) + "</h3>" +
      '<p class="hint">FINGER (Ngandu 2015) · AHA Life\u2019s Essential 8 (2022) · WHO 2019 risk reduction · Lancet Commission 2024 · INTERSTROKE 2016 · Sabia 2021. ' +
      esc(t("foot_disclaimer")) + "</p></section>";

    return {
      html: html,
      mount: function () {
        var view = document.getElementById("view");
        view.querySelectorAll("[data-plan-toggle]").forEach(function (b) {
          b.addEventListener("click", function () {
            var id = b.getAttribute("data-plan-toggle");
            var item = p.items.filter(function (x) { return x.id === id; })[0];
            if (!item) return;
            item.done = !item.done;
            st.setPlan(p);
            root.BG.rerender();
          });
        });
        var rb = view.querySelector("[data-plan-rebuild]");
        if (rb) rb.addEventListener("click", function () {
          st.setPlan(null);
          root.BG.rerender();
          root.BG.toast(t("saved"));
        });
      }
    };
  }

  /* ---------------- trends ---------------- */

  function trends(ctx) {
    var st = ctx.store;
    var days = ctx.trendDays || 28;
    var logs = st.lastNDays(days);
    var sessions = st.sessions();
    var avg = M.factorAverages(logs, st.shiftDays, days);
    var dom = M.domains(logs, sessions, st.shiftDays, days);

    var html = '<section class="card"><div class="row between">' +
      "<div><h2>" + esc(t("tr_t")) + '</h2><p class="hint">' + esc(t("tr_b")) + "</p></div>" +
      '<div class="seg" style="width:auto"><button data-range="28" aria-pressed="' + (days === 28) + '">' + esc(t("tr_28")) + "</button>" +
      '<button data-range="90" aria-pressed="' + (days === 90) + '">' + esc(t("tr_90")) + "</button></div></div>" +
      '<p class="hint mt-s">' + esc(t("covered_days", { n: logs.length, d: days })) + "</p></section>";

    if (!logs.length) {
      return { html: html + '<section class="card"><div class="empty">' + icon("chart") + "<p>" + esc(t("tr_empty")) + "</p>" +
        '<button class="btn ghost" data-go="log">' + esc(t("cta_log")) + "</button></div></section>" };
    }

    html += '<div class="grid g2 mt"><section class="card"><h3>' + esc(t("bhi")) + "</h3>" +
      '<div style="display:flex;justify-content:center">' + radar(dom) + "</div></section>" +
      '<section class="card"><h3>' + esc(t("tr_factors")) + "</h3>" +
      M.FACTORS.map(function (f) {
        var s = avg[f.id];
        return '<div class="factor-row"><div class="nm">' + esc(t("f_" + f.id)) + '</div><div class="bar"><i style="width:' +
          (s.value === null ? 0 : s.value) + '%"></i></div><div class="val">' + (s.value === null ? "—" : s.value) + "</div></div>";
      }).join("") + "</section></div>";

    // Factor detail charts
    html += '<section class="card mt"><h3>' + esc(t("tr_factors")) + "</h3>";
    ["sleep", "move", "bp", "stress"].forEach(function (id) {
      var s = avg[id];
      html += '<div style="margin-bottom:16px"><div class="row between"><b style="font-size:13.5px">' + esc(t("f_" + id)) + "</b>" +
        '<span class="hint num">' + (s.value === null ? esc(t("not_enough")) : s.value + "/100") + "</span></div>" +
        areaChart(s.series, { height: 90 }) + "</div>";
    });
    html += "</section>";

    // Sensor table
    var last = sessions[sessions.length - 1];
    html += '<section class="card"><h3>' + esc(t("tr_sensors")) + "</h3>";
    if (sessions.length < 2) {
      html += '<div class="empty"><p>' + esc(t("not_enough")) + "</p>" +
        '<button class="btn ghost" data-go="check">' + esc(t("nav_check")) + "</button></div>";
    } else {
      html += '<table><thead><tr><th>' + esc(t("check_t")) + "</th><th>" + esc(t("tr_28")) + "</th><th>" + esc(t("tr_baseline")) + "</th><th>z</th></tr></thead><tbody>";
      M.METRICS.forEach(function (m) {
        // Latest value of this metric, whenever it was last measured.
        var series = M.metricSeries(sessions, m.id);
        if (!series.length) return;
        var v = series[series.length - 1];
        var base = series.slice(0, -1);
        var med = base.length ? M.median(base) : null;
        var z = M.zAgainst(base, v);
        html += "<tr><td>" + esc(t(M.METRIC_LABEL[m.id])) + "</td><td><b>" + v + "</b></td><td>" +
          (med === null ? "—" : med.toFixed(1)) + "</td><td>" +
          (z === null ? '<span class="tag">—</span>' : '<span class="tag ' + (Math.abs(z) >= 2 ? "bad" : Math.abs(z) >= 1 ? "warn" : "ok") + '">' + z.toFixed(1) + "</span>") +
          "</td></tr>";
      });
      html += "</tbody></table><p class=\"hint mt-s\">" + esc(t("tr_z")) + " · n = " + sessions.length + "</p>";
    }
    html += "</section>";

    return {
      html: html,
      mount: function () {
        document.querySelectorAll("[data-range]").forEach(function (b) {
          b.addEventListener("click", function () {
            root.BG.setTrendDays(Number(b.getAttribute("data-range")));
          });
        });
      }
    };
  }

  root.BGViews = {
    today: today, log: log, plan: plan, trends: trends,
    resetDraft: function () { DRAFT = null; },
    helpers: { ring: ring, areaChart: areaChart, spark: spark, radar: radar, insightCard: insightCard, esc: esc, icon: icon, sevChip: sevChip, planRow: planRow } };
})(typeof self !== "undefined" ? self : this);
