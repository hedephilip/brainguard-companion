/* BrainGuard Companion — local store
   One JSON document in localStorage. No network, no identifiers, no timestamps
   beyond what the user needs to see their own trend. */
(function (root) {
  "use strict";

  var KEY = "bg.companion.v3";
  var VERSION = 3;

  function blank() {
    return {
      v: VERSION,
      createdAt: Date.now(),
      profile: {
        lang: null,
        country: "MY",
        ageBand: "",
        sex: "",
        conditions: { bp: false, diabetes: false, af: false, priorStroke: false },
        onboarded: false
      },
      consent: { camera: false, mic: false, motion: false },
      logs: {},
      sessions: [],
      plan: null,
      events: []
    };
  }

  var state = null;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function load() {
    if (state) return state;
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) { state = blank(); return state; }
      var parsed = JSON.parse(raw);
      state = migrate(parsed);
    } catch (e) {
      state = blank();
    }
    return state;
  }

  function migrate(d) {
    var base = blank();
    if (!d || typeof d !== "object") return base;
    base.createdAt = d.createdAt || base.createdAt;
    base.profile = Object.assign(base.profile, d.profile || {});
    base.profile.conditions = Object.assign({}, base.profile.conditions, (d.profile || {}).conditions || {});
    base.consent = Object.assign(base.consent, d.consent || {});
    base.logs = d.logs && typeof d.logs === "object" ? d.logs : {};
    base.sessions = Array.isArray(d.sessions) ? d.sessions : [];
    base.plan = d.plan || null;
    base.events = Array.isArray(d.events) ? d.events : [];
    base.v = VERSION;
    return base;
  }

  function save() {
    if (!state) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      // Quota or private mode: keep working in memory, tell the UI.
      root.BGStore.persistFailed = true;
    }
  }

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  function dayKey(d) {
    var x = d || new Date();
    return x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate());
  }

  function parseKey(k) {
    var p = k.split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function shiftDays(k, n) {
    var d = parseKey(k);
    d.setDate(d.getDate() + n);
    return dayKey(d);
  }

  function daysBetween(a, b) {
    return Math.round((parseKey(b) - parseKey(a)) / 86400000);
  }

  function getLog(k) { return load().logs[k] || null; }

  function upsertLog(k, entry) {
    var d = load();
    var prev = d.logs[k] || {};
    d.logs[k] = Object.assign({}, prev, entry, { updatedAt: Date.now() });
    logEvent("log", { date: k });
    save();
    return d.logs[k];
  }

  function deleteLog(k) {
    var d = load();
    delete d.logs[k];
    save();
  }

  function logsInRange(fromKey, toKey) {
    var d = load();
    var out = [];
    Object.keys(d.logs).forEach(function (k) {
      if (k >= fromKey && k <= toKey) out.push(Object.assign({ date: k }, d.logs[k]));
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return out;
  }

  function lastNDays(n) {
    var end = dayKey();
    return logsInRange(shiftDays(end, -(n - 1)), end);
  }

  function streak() {
    var d = load();
    var k = dayKey();
    if (!d.logs[k]) k = shiftDays(k, -1); // yesterday still counts while today is open
    var n = 0;
    while (d.logs[k]) {
      n++;
      k = shiftDays(k, -1);
    }
    return n;
  }

  function addSession(s) {
    var d = load();
    s.id = "s" + Date.now().toString(36);
    s.ts = s.ts || Date.now();
    d.sessions.push(s);
    logEvent("session", { id: s.id });
    save();
    return s;
  }

  function sessions() {
    return load().sessions.slice().sort(function (a, b) { return a.ts - b.ts; });
  }

  function setConsent(k, v) {
    var d = load();
    d.consent[k] = !!v;
    logEvent("consent", { key: k, value: !!v });
    save();
  }

  function setProfile(patch) {
    var d = load();
    d.profile = Object.assign(d.profile, patch);
    save();
  }

  function plan() { return load().plan; }
  function setPlan(p) { load().plan = p; save(); return p; }

  function logEvent(type, meta) {
    var d = load();
    d.events.push({ ts: Date.now(), type: type, meta: meta || null });
    if (d.events.length > 400) d.events = d.events.slice(-400);
  }

  function exportJSON() {
    var d = load();
    return JSON.stringify({
      app: "BrainGuard Companion",
      version: VERSION,
      exportedAt: new Date().toISOString(),
      data: d
    }, null, 2);
  }

  function importJSON(text) {
    var parsed = JSON.parse(text);
    var incoming = parsed && parsed.data ? parsed.data : parsed;
    if (!incoming || typeof incoming !== "object" || !incoming.logs) {
      throw new Error("Not a BrainGuard backup");
    }
    state = migrate(incoming);
    save();
  }

  function wipe() {
    state = blank();
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  function bytes() {
    try { return new Blob([JSON.stringify(load())]).size; } catch (e) { return 0; }
  }

  root.BGStore = {
    KEY: KEY,
    load: load, save: save, dayKey: dayKey, shiftDays: shiftDays, daysBetween: daysBetween,
    getLog: getLog, upsertLog: upsertLog, deleteLog: deleteLog, logsInRange: logsInRange, lastNDays: lastNDays,
    streak: streak, addSession: addSession, sessions: sessions,
    setConsent: setConsent, setProfile: setProfile, plan: plan, setPlan: setPlan,
    exportJSON: exportJSON, importJSON: importJSON, wipe: wipe, bytes: bytes,
    clone: clone
  };
})(typeof self !== "undefined" ? self : this);
