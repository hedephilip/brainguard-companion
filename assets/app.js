/* BrainGuard Companion — shell, router, language, first run */
(function (root) {
  "use strict";

  var store = root.BGStore;
  var V1 = root.BGViews;
  var V2 = root.BGViews2;

  var ROUTES = [
    { id: "today", icon: "home", title: "nav_today", sub: "sub_today" },
    { id: "log", icon: "log", title: "nav_log", sub: "sub_log" },
    { id: "check", icon: "pulse", title: "nav_check", sub: "sub_check" },
    { id: "trends", icon: "chart", title: "nav_trends", sub: "sub_trends" },
    { id: "plan", icon: "plan", title: "nav_plan", sub: "sub_plan" },
    { id: "report", icon: "print", title: "nav_report", sub: "sub_report" },
    { id: "privacy", icon: "shield", title: "nav_privacy", sub: "sub_privacy" },
    { id: "emergency", icon: "alert", title: "nav_emergency", sub: "sub_emergency" }
  ];

  var LANGS = [["en", "English"], ["ms", "Bahasa Melayu"], ["zh", "中文"], ["es", "Español"]];

  var trendDays = 28;
  var current = "today";

  /* ---------------- language ---------------- */

  function lang() {
    var p = store.load().profile;
    if (p.lang && root.BG_I18N[p.lang]) return p.lang;
    return "en";
  }

  function t(key, vars) {
    var pack = root.BG_I18N[lang()] || root.BG_I18N.en;
    var s = pack[key] !== undefined ? pack[key] : root.BG_I18N.en[key] !== undefined ? root.BG_I18N.en[key] : key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.replace(new RegExp("\\{" + k + "\\}", "g"), vars[k]);
      });
    }
    return s;
  }

  function setLang(l) {
    store.setProfile({ lang: l });
    document.documentElement.lang = l;
    buildNav();
    render();
  }

  /* ---------------- UI plumbing ---------------- */

  function toast(msg) {
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("show"); }, 2400);
  }

  var modalActions = [];

  function modal(opts) {
    var m = document.getElementById("modal");
    document.getElementById("modalTitle").textContent = opts.title || "";
    var body = document.getElementById("modalBody");
    body.innerHTML = opts.body || "";
    var act = document.getElementById("modalActions");
    act.innerHTML = "";
    modalActions = [];
    (opts.actions || []).forEach(function (a, i) {
      var b = document.createElement("button");
      b.className = "btn " + (a.primary ? "" : "ghost");
      b.textContent = a.label;
      b.addEventListener("click", function () {
        if (a.keepOpen) { a.onClick && a.onClick(body); return; }
        close();
        a.onClick && a.onClick(body);
      });
      act.appendChild(b);
      modalActions.push(b);
    });
    m.hidden = false;
    if (opts.onMount) opts.onMount(body);
  }

  function close() {
    document.getElementById("modal").hidden = true;
  }

  function confirm(title, body, okLabel, onOk) {
    modal({
      title: title,
      body: "<p>" + body + "</p>",
      actions: [
        { label: t("a_cancel") },
        { label: okLabel, primary: true, onClick: onOk }
      ]
    });
  }

  function ensureConsent(key, retry) {
    if (store.load().consent[key]) return true;
    var label = { camera: "pv_cam", mic: "pv_mic", motion: "pv_motion" }[key];
    modal({
      title: t("pv_consent"),
      body: '<p class="hint">' + t("check_privacy") + "</p><p>" + t(label) + "</p>",
      actions: [
        { label: t("a_cancel") },
        {
          label: t("a_yes"), primary: true, onClick: function () {
            store.setConsent(key, true);
            if (retry) retry();
          }
        }
      ]
    });
    return false;
  }

  /* ---------------- nav ---------------- */

  function buildNav() {
    var side = document.getElementById("sidenav");
    side.innerHTML = ROUTES.map(function (r) {
      return '<a href="#/' + r.id + '" data-route="' + r.id + '">' +
        '<svg class="ic" aria-hidden="true"><use href="#i-' + r.icon + '"/></svg>' +
        "<span>" + t(r.title) + "</span>" +
        (r.id === "today" ? '<span class="badge hide" data-badge>!</span>' : "") +
        "</a>";
    }).join("");

    var tabs = ["today", "log", "check", "trends", "plan"];
    document.getElementById("tabbar").innerHTML = tabs.map(function (id) {
      var r = ROUTES.filter(function (x) { return x.id === id; })[0];
      return '<a href="#/' + r.id + '" data-tab="' + r.id + '">' +
        '<svg class="ic" aria-hidden="true"><use href="#i-' + r.icon + '"/></svg>' +
        "<span>" + t(r.title) + "</span></a>";
    }).join("");

    var sel = document.getElementById("langSel");
    sel.innerHTML = LANGS.map(function (l) {
      return '<option value="' + l[0] + '"' + (l[0] === lang() ? " selected" : "") + ">" + l[1] + "</option>";
    }).join("");
  }

  function markNav() {
    document.querySelectorAll("[data-route]").forEach(function (a) {
      a.classList.toggle("on", a.getAttribute("data-route") === current);
    });
    document.querySelectorAll("[data-tab]").forEach(function (a) {
      a.classList.toggle("on", a.getAttribute("data-tab") === current);
    });
  }

  /* ---------------- router ---------------- */

  function route() {
    var h = (location.hash || "#/today").replace(/^#\/?/, "");
    var id = h.split("?")[0] || "today";
    if (!ROUTES.some(function (r) { return r.id === id; })) id = "today";
    current = id;
    render();
  }

  function go(id) { location.hash = "#/" + id; }

  function applyStatic() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
  }

  function render() {
    applyStatic();
    var view = document.getElementById("view");
    var r = ROUTES.filter(function (x) { return x.id === current; })[0];
    document.getElementById("pageTitle").textContent = t(r.title);
    document.getElementById("pageSub").textContent = t(r.sub);
    var st = store.load();
    document.getElementById("streakPill").textContent = store.streak() + " " + t("days");

    var ctx = {
      store: store,
      trendDays: trendDays,
      saveLog: saveLog
    };

    var out;
    if (current === "today") out = V1.today(ctx);
    else if (current === "log") out = V1.log(ctx);
    else if (current === "plan") out = V1.plan(ctx);
    else if (current === "trends") out = V1.trends(ctx);
    else if (current === "check") out = V2.check(ctx);
    else if (current === "report") out = V2.report(ctx);
    else if (current === "privacy") out = V2.privacy(ctx);
    else if (current === "emergency") out = root.BGEmergency.view(ctx);

    view.innerHTML = out.html;
    if (out.mount) out.mount();
    markNav();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    updateBadge();
  }

  function updateBadge() {
    var logs = store.lastNDays(28);
    var sessions = store.sessions();
    var ins = root.BGModel.insights({ logs: logs, sessions: sessions, today: store.dayKey(), shift: store.shiftDays });
    var top = ins[0];
    var badge = document.querySelector("[data-badge]");
    if (!badge) return;
    var urgent = top && (top.sev === "urgent" || top.sev === "act");
    badge.classList.toggle("hide", !urgent);
  }

  function rerender() { render(); }

  /* ---------------- logging ---------------- */

  function num(v) {
    if (v === "" || v === null || v === undefined) return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }

  function saveLog(draft) {
    var entry = {
      sleepH: num(draft.sleepH),
      sleepQ: num(draft.sleepQ),
      stress: num(draft.stress),
      mood: num(draft.mood),
      moveMin: num(draft.moveMin),
      moveType: draft.moveType || "",
      bpSys: num(draft.bpSys),
      bpDia: num(draft.bpDia),
      smoke: draft.smoke || null,
      alcohol: draft.alcohol || null,
      dietVeg: draft.dietVeg === "" ? null : draft.dietVeg,
      dietFried: draft.dietFried === "" ? null : draft.dietFried,
      dietSalt: draft.dietSalt === "" ? null : draft.dietSalt,
      connect: draft.connect || null,
      hear: draft.hear || null,
      vision: draft.vision || null,
      mindDays: num(draft.mindDays)
    };
    // A completely empty form should not create an empty day.
    var any = Object.keys(entry).some(function (k) {
      return entry[k] !== null && entry[k] !== "";
    });
    if (!any) { toast(t("error")); return; }

    store.upsertLog(store.dayKey(), entry);
    V1.resetDraft();
    toast(t("saved"));
    store.setPlan(null); // the plan is rebuilt from the new data on next visit
    go("today");
    setTimeout(render, 30);
  }

  /* ---------------- example data ---------------- */

  function seedDemo() {
    var logs = {};
    var today = store.dayKey();
    for (var i = 27; i >= 0; i--) {
      var k = store.shiftDays(today, -i);
      var wave = Math.sin(i / 3.1);
      var weekend = new Date(store.shiftDays(today, -i).replace(/-/g, "/")).getDay();
      var lazy = weekend === 0 || weekend === 6;
      logs[k] = {
        // A two-week sleep dip plus a quiet fortnight gives the demo an honest
        // cross-factor pattern instead of a single bad day.
        sleepH: Math.round((6.75 + wave * 0.5 + (lazy ? 0.4 : 0) - (i < 14 ? 0.8 : 0)) * 10) / 10,
        sleepQ: lazy ? 4 : 3,
        stress: Math.max(1, Math.min(10, Math.round(5 + wave * 1.6))),
        mood: lazy ? 4 : 3,
        moveMin: lazy ? 8 : 14 + Math.round(Math.abs(wave) * 12),
        moveType: lazy ? "walk" : "walk, cycle",
        dietVeg: i % 3 === 0 ? "once" : "twice",
        dietFried: i % 4 === 0 ? "once" : "never",
        dietSalt: i % 5 === 0 ? "once" : "never",
        connect: i % 4 === 0 ? "daily" : "weekly",
        hear: "no",
        vision: "some",
        mindDays: 1 + (i % 2),
        smoke: "none",
        alcohol: "low",
        updatedAt: Date.now() - i * 86400000
      };
      if (i === 24 || i === 12 || i === 3) {
        logs[k].bpSys = [132, 136, 138][i === 24 ? 0 : i === 12 ? 1 : 2];
        logs[k].bpDia = [84, 86, 88][i === 24 ? 0 : i === 12 ? 1 : 2];
      }
    }

    var sessions = [
      { daysAgo: 34, metrics: { tapRate: 3.30, tapCv: 9, speechRate: 4.8, f0Sd: 1.6, pauseRatio: 18, swayRms: 22, rtMedian: 295, rtCv: 14, faceAsym: 3.1, blinkRate: 17 } },
      { daysAgo: 24, metrics: { tapRate: 3.25, tapCv: 10, speechRate: 4.7, f0Sd: 1.7, pauseRatio: 19, swayRms: 24, rtMedian: 300, rtCv: 15, faceAsym: 3.4, blinkRate: 16 } },
      { daysAgo: 12, metrics: { tapRate: 2.70, tapCv: 16, speechRate: 4.5, f0Sd: 2.4, pauseRatio: 26, swayRms: 30, rtMedian: 336, rtCv: 20, faceAsym: 4.1, blinkRate: 14 } },
      { daysAgo: 3, metrics: { tapRate: 2.55, tapCv: 19, speechRate: 4.3, f0Sd: 2.9, pauseRatio: 31, swayRms: 34, rtMedian: 355, rtCv: 24, faceAsym: 5.0, blinkRate: 12 } }
    ].map(function (s, i) {
      return {
        id: "demo" + i,
        ts: Date.now() - s.daysAgo * 86400000,
        kind: "battery",
        metrics: s.metrics,
        quality: { ok: true, level: "fair", notes: [] },
        demo: true
      };
    });

    var d = store.load();
    d.logs = logs;
    d.sessions = sessions;
    d.plan = null;
    d.profile.demo = true;
    d.profile.onboarded = true;
    store.save();
    store.setPlan(null);
    go("today");
    toast(t("saved"));
    setTimeout(render, 20);
  }

  function clearDemo() {
    store.wipe();
    store.setProfile({ onboarded: true, lang: lang(), country: "MY" });
    go("today");
    setTimeout(render, 20);
    toast(t("deleted"));
  }

  /* ---------------- first run ---------------- */

  function firstRun() {
    var st = store.load();
    if (st.profile.onboarded) return;
    var langOpts = LANGS.map(function (l) { return '<option value="' + l[0] + '"' + (l[0] === lang() ? " selected" : "") + ">" + l[1] + "</option>"; }).join("");
    var countryOpts = V2.COUNTRIES.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === (st.profile.country || "MY") ? " selected" : "") + ">" + c[1] + "</option>"; }).join("");

    modal({
      title: t("app_name"),
      body:
        '<p class="hint">' + t("app_tag") + "</p>" +
        '<div class="field mt"><label for="obLang">' + t("pv_t") + "</label><select id=\"obLang\">" + langOpts + "</select></div>" +
        '<div class="field"><label for="obCountry">' + t("em_local") + "</label><select id=\"obCountry\">" + countryOpts + "</select></div>" +
        '<p class="hint">' + t("pv_b") + "</p>" +
        '<p class="hint">' + t("foot_disclaimer") + "</p>",
      actions: [
        {
          label: t("a_start"), primary: true, onClick: function (body) {
            var l = body.querySelector("#obLang").value;
            var c = body.querySelector("#obCountry").value;
            store.setProfile({ lang: l, country: c, onboarded: true });
            document.documentElement.lang = l;
            buildNav();
            render();
            setTimeout(function () {
              modal({
                title: t("pv_consent"),
                body: '<p class="hint">' + t("check_privacy") + "</p>" + toggleRow("camera", "pv_cam", "pv_cam_d") + toggleRow("mic", "pv_mic", "pv_mic_d") + toggleRow("motion", "pv_motion", "pv_motion_d"),
                actions: [{ label: t("a_done"), primary: true }],
                onMount: function (b) {
                  b.querySelectorAll("[data-ob]").forEach(function (btn) {
                    btn.addEventListener("click", function () {
                      var k = btn.getAttribute("data-ob");
                      var next = btn.getAttribute("aria-checked") !== "true";
                      btn.setAttribute("aria-checked", next ? "true" : "false");
                      store.setConsent(k, next);
                    });
                  });
                }
              });
            }, 220);
          }
        }
      ]
    });
  }

  function toggleRow(key, title, desc) {
    var on = !!store.load().consent[key];
    return '<div class="switch"><div class="txt"><b>' + t(title) + "</b><span>" + t(desc) + "</span></div>" +
      '<button class="toggle" role="switch" aria-checked="' + on + '" data-ob="' + key + '" aria-label="' + t(title) + '"></button></div>';
  }

  /* ---------------- boot ---------------- */

  function boot() {
    store.load();
    document.documentElement.lang = lang();
    buildNav();

    document.getElementById("langSel").addEventListener("change", function (e) { setLang(e.target.value); });
    document.querySelector(".menu-btn").addEventListener("click", function () {
      document.querySelector(".side").classList.toggle("open");
    });
    document.addEventListener("click", function (e) {
      var el = e.target.closest("[data-go]");
      if (el) { e.preventDefault(); go(el.getAttribute("data-go")); return; }
      if (e.target.closest("[data-demo]")) { seedDemo(); return; }
      if (e.target.closest("[data-demo-clear]")) { clearDemo(); return; }
    });
    window.addEventListener("hashchange", route);

    route();

    if (!store.load().profile.onboarded) firstRun();

    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }

  root.BG = {
    t: t, lang: lang, setLang: setLang, go: go, toast: toast, confirm: confirm,
    modal: modal, closeModal: close, rerender: rerender, store: store,
    ensureConsent: ensureConsent,
    setTrendDays: function (d) { trendDays = d; render(); },
    fmtDate: function (ts) {
      try {
        return new Intl.DateTimeFormat(lang(), { day: "numeric", month: "short" }).format(new Date(ts));
      } catch (e) { return new Date(ts).toISOString().slice(0, 10); }
    },
    render: render
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(typeof self !== "undefined" ? self : this);
