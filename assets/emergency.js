/* BrainGuard Companion — emergency module
   A deliberate safety floor, not a diagnostic engine:
     - any single current BEFAST sign is RED (no weighting, no BP gate)
     - fully resolved symptoms go AMBER (possible TIA, same-day assessment)
     - no signs selected is GREEN, and GREEN explicitly cannot rule anything out
   Nothing here auto-dials. The caller always places the call. */
(function (root) {
  "use strict";

  var SIGNS = ["balance", "eyes", "face", "arm", "speech"];
  var FLAGS = ["headache", "confusion", "seizure", "chest", "breath"];

  function assess(input) {
    var i = input || {};
    var signs = i.signs || {};
    var flags = i.flags || {};

    var current = SIGNS.filter(function (k) { return signs[k]; });
    var red = FLAGS.filter(function (k) { return flags[k]; });
    var reasons = [];

    current.forEach(function (k) { reasons.push({ id: k, kind: "sign" }); });
    red.forEach(function (k) { reasons.push({ id: k, kind: "flag" }); });

    if (current.length || red.length) {
      return {
        level: "red",
        reasons: reasons,
        // Onset under 4.5 h is the window in which reperfusion therapy is usually possible.
        timeCritical: i.onset === "now" || i.onset === "1h" || i.onset === "45"
      };
    }
    if (i.resolved) {
      return { level: "amber", reasons: [{ id: "resolved", kind: "history" }], timeCritical: true };
    }
    return { level: "green", reasons: [], timeCritical: false };
  }

  function onsetLabel(onset, t) {
    return {
      now: t("em_onset_now"), "1h": t("em_onset_1h"), "45": t("em_onset_45"),
      "24": t("em_onset_24"), old: t("em_onset_old"), unknown: t("em_onset_unknown")
    }[onset] || t("em_onset_unknown");
  }

  function handoverText(state, country) {
    var t = root.BG.t;
    var A = root.BG;
    var names = [];
    SIGNS.concat(FLAGS).forEach(function (k) {
      if (state.signs[k] || state.flags[k]) names.push(t("em_s_" + k));
    });
    if (state.resolved) names.push(t("em_resolved_short"));
    var now = new Date();
    var hh = ("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2);
    return t("em_handover_tpl", {
      signs: names.length ? names.join(", ") : t("em_none_selected"),
      onset: onsetLabel(state.onset, t),
      time: hh,
      number: country[2]
    });
  }

  var state = {
    signs: {}, flags: {}, resolved: false, onset: "unknown"
  };

  function toggleRow(key, group, titleKey, descKey, danger) {
    var on = group === "signs" ? !!state.signs[key] : !!state.flags[key];
    return '<button type="button" class="em-toggle' + (on ? " on" : "") + (danger ? " danger" : "") +
      '" data-em="' + group + '" data-key="' + key + '" aria-pressed="' + on + '">' +
      '<span class="em-name">' + root.BG.t(titleKey) + "</span>" +
      '<span class="em-desc">' + root.BG.t(descKey) + "</span>" +
      '<span class="em-check" aria-hidden="true">' + (on ? "&#10003;" : "") + "</span>" +
      "</button>";
  }

  function verdictHtml(country) {
    var t = root.BG.t;
    var r = assess(state);
    var cls = r.level === "red" ? "danger" : r.level === "amber" ? "warn" : "info";
    var title = r.level === "red" ? t("em_red") : r.level === "amber" ? t("em_amber") : t("em_green");
    var advice = r.level === "red" ? t("em_red_advice") : r.level === "amber" ? t("em_amber_advice") : t("em_green_advice");

    var reasons = "";
    if (r.reasons.length) {
      reasons = '<div class="drivers">' + r.reasons.map(function (x) {
        return '<span class="driver down">' + root.BG.t("em_s_" + x.id) + "</span>";
      }).join("") + "</div>";
    }

    var callBtn = r.level === "red"
      ? '<a class="btn lg block" href="tel:' + country[2] + '" style="text-decoration:none;margin-top:12px">' +
        t("em_call") + " · " + country[2] + "</a>"
      : "";

    return '<div class="callout ' + cls + '">' +
      '<div style="font-size:17px;font-weight:800;letter-spacing:-.2px">' + title + "</div>" +
      '<div style="margin-top:6px;font-size:13.5px">' + advice + "</div>" +
      reasons + callBtn +
      (r.level === "red" && r.timeCritical ? '<p class="hint" style="margin-top:10px;color:#ffd2cf">' + t("em_note") + "</p>" : "") +
      "</div>";
  }

  function handoverHtml(country) {
    var text = handoverText(state, country);
    return '<div class="handover" id="emHandover">' + root.BGViews.helpers.esc(text) + "</div>" +
      '<div class="btn-row"><button class="btn ghost" data-em-copy>' + root.BG.t("em_copy") + "</button>" +
      '<button class="btn ghost" data-em-reset>' + root.BG.t("em_reset") + "</button></div>";
  }

  function view(ctx) {
    var t = root.BG.t;
    var store = ctx.store;
    var code = store.load().profile.country || "MY";
    var country = root.BGViews2.countryRow(code);
    var options = root.BGViews2.COUNTRIES.map(function (c) {
      return '<option value="' + c[0] + '"' + (c[0] === code ? " selected" : "") + ">" + c[1] + " · " + c[2] + "</option>";
    }).join("");

    var html = '<section class="card em-head">' +
      '<div class="row between"><div><h2 style="font-size:20px">' + t("em_t") + "</h2>" +
      '<p class="hint" style="max-width:60ch">' + t("em_b") + "</p></div></div>" +
      '<div class="two mt-s"><div class="field" style="margin:0"><label for="emCountry">' + t("em_local") + "</label>" +
      '<select id="emCountry">' + options + "</select></div>" +
      '<div class="field" style="margin:0"><label for="emOnset">' + t("em_onset") + "</label>" +
      '<select id="emOnset">' + ["now", "1h", "45", "24", "old", "unknown"].map(function (k) {
        return '<option value="' + k + '"' + (state.onset === k ? " selected" : "") + ">" + onsetLabel(k, t) + "</option>";
      }).join("") + "</select></div></div></section>";

    html += '<section class="card"><h3>' + t("em_q_signs") + "</h3>" +
      '<p class="hint">' + t("em_signs_hint") + "</p>" +
      '<div class="em-grid">' +
      toggleRow("balance", "signs", "em_s_balance", "em_s_balance_d") +
      toggleRow("eyes", "signs", "em_s_eyes", "em_s_eyes_d") +
      toggleRow("face", "signs", "em_s_face", "em_s_face_d") +
      toggleRow("arm", "signs", "em_s_arm", "em_s_arm_d") +
      toggleRow("speech", "signs", "em_s_speech", "em_s_speech_d") +
      "</div>" +
      '<label class="em-resolved"><input type="checkbox" id="emResolved"' + (state.resolved ? " checked" : "") + ">" +
      "<span>" + t("em_resolved") + "</span></label></section>";

    html += '<section class="card"><h3>' + t("em_other") + "</h3>" +
      '<div class="em-grid">' +
      toggleRow("headache", "flags", "em_s_headache", "em_s_headache_d", true) +
      toggleRow("confusion", "flags", "em_s_confusion", "em_s_confusion_d", true) +
      toggleRow("seizure", "flags", "em_s_seizure", "em_s_seizure_d", true) +
      toggleRow("chest", "flags", "em_s_chest", "em_s_chest_d", true) +
      toggleRow("breath", "flags", "em_s_breath", "em_s_breath_d", true) +
      "</div></section>";

    html += '<section class="card" id="emVerdictCard"><h3>' + t("em_result") + "</h3>" +
      '<div id="emVerdict">' + verdictHtml(country) + "</div>" +
      '<div class="mt"><h3>' + t("em_handover") + "</h3>" +
      '<div id="emHandoverWrap">' + handoverHtml(country) + "</div></div>" +
      '<p class="hint mt-s">' + t("foot_disclaimer") + "</p></section>";

    return {
      html: html,
      mount: function () {
        var view = document.getElementById("view");

        function refresh() {
          var v = document.getElementById("emVerdict");
          if (v) v.innerHTML = verdictHtml(country);
          var h = document.getElementById("emHandoverWrap");
          if (h) h.innerHTML = handoverHtml(country);
          bindCopy();
        }

        function bindCopy() {
          var b = view.querySelector("[data-em-copy]");
          if (b) b.addEventListener("click", function () {
            var text = document.getElementById("emHandover").textContent;
            var done = function () { root.BG.toast(t("em_copied")); };
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(text).then(done, function () { root.BG.toast(t("error")); });
            } else {
              root.BG.toast(t("error"));
            }
          });
          var r = view.querySelector("[data-em-reset]");
          if (r) r.addEventListener("click", function () {
            state.signs = {}; state.flags = {}; state.resolved = false; state.onset = "unknown";
            root.BG.rerender();
          });
        }

        view.querySelectorAll("[data-em]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var group = btn.getAttribute("data-em");
            var key = btn.getAttribute("data-key");
            var bag = group === "signs" ? state.signs : state.flags;
            bag[key] = !bag[key];
            btn.classList.toggle("on", bag[key]);
            btn.setAttribute("aria-pressed", bag[key] ? "true" : "false");
            var mark = btn.querySelector(".em-check");
            if (mark) mark.innerHTML = bag[key] ? "&#10003;" : "";
            refresh();
          });
        });

        var res = document.getElementById("emResolved");
        if (res) res.addEventListener("change", function () {
          state.resolved = res.checked;
          refresh();
        });

        var onset = document.getElementById("emOnset");
        if (onset) onset.addEventListener("change", function () {
          state.onset = onset.value;
          refresh();
        });

        var sel = document.getElementById("emCountry");
        if (sel) sel.addEventListener("change", function () {
          store.setProfile({ country: sel.value });
          root.BG.rerender();
        });

        bindCopy();
      }
    };
  }

  root.BGEmergency = { assess: assess, view: view, state: state, handoverText: handoverText, SIGNS: SIGNS, FLAGS: FLAGS };
})(typeof self !== "undefined" ? self : this);
