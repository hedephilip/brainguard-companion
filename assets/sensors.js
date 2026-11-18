/* BrainGuard Companion — measurement engines
   Each engine returns raw, derived numbers only. Nothing here stores audio,
   frames or motion samples; they are consumed and dropped at the end of a run.
   Quality is reported separately from the value so the UI can refuse a number
   rather than display a bad one. */
(function (root) {
  "use strict";

  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var mean = function (a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : 0; };
  function sd(a) {
    if (a.length < 2) return 0;
    var m = mean(a);
    return Math.sqrt(a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / (a.length - 1));
  }
  function median(a) {
    if (!a.length) return 0;
    var b = a.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(b.length / 2);
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }

  /* ---------------- finger tapping ---------------- */

  function runTap(o) {
    var el = o.el, dur = o.duration || 20000;
    var taps = [], cancelled = false, finished = false;
    var start = performance.now();
    var timer, tick;

    function hit(e) {
      if (e) e.preventDefault();
      if (finished) return;
      taps.push(performance.now());
      el.classList.add("hit");
      setTimeout(function () { el.classList.remove("hit"); }, 70);
      if (o.onTick) o.onTick({ taps: taps.length, elapsed: (performance.now() - start) / 1000 });
    }

    el.addEventListener("pointerdown", hit);
    tick = setInterval(function () {
      if (!o.onTick) return;
      o.onTick({ taps: taps.length, elapsed: (performance.now() - start) / 1000 });
    }, 250);

    var settle;
    var promise = new Promise(function (resolve) {
      settle = resolve;
      timer = setTimeout(finish, dur);
    });

    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(timer); clearInterval(tick);
      el.removeEventListener("pointerdown", hit);
      if (!settle) return;

      if (cancelled) { settle({ cancelled: true }); return; }

      var iti = [];
      for (var i = 1; i < taps.length; i++) iti.push(taps[i] - taps[i - 1]);
      var seconds = Math.max(1, (performance.now() - start) / 1000);
      var rate = taps.length / seconds;
      var mITI = mean(iti);
      var cv = mITI > 0 ? sd(iti) / mITI : 1;
      var third = Math.floor(iti.length / 3);
      var drift = 1;
      if (third >= 2) {
        var first = mean(iti.slice(0, third));
        var last = mean(iti.slice(iti.length - third));
        drift = first > 0 ? last / first : 1;
      }

      settle({
        metrics: {
          tapRate: round2(rate),
          tapCv: round2(cv * 100)
        },
        quality: {
          ok: taps.length >= 15 && cv <= 0.85,
          level: taps.length >= 25 && cv <= 0.6 ? "high" : taps.length >= 15 ? "fair" : "low",
          notes: taps.length < 15 ? ["too_few_taps"] : cv > 0.85 ? ["irregular"] : []
        }
      });
    }

    return { promise: promise, cancel: function () { cancelled = true; finish(); } };
  }

  /* ---------------- voice ---------------- */

  function autocorrelateF0(buf, sampleRate) {
    var n = buf.length;
    var minLag = Math.floor(sampleRate / 400);
    var maxLag = Math.min(Math.floor(sampleRate / 70), n - 2);
    var best = 0, bestLag = -1;
    for (var lag = minLag; lag <= maxLag; lag++) {
      var sum = 0, e1 = 0, e2 = 0;
      for (var i = 0; i < n - lag; i += 2) {
        var a = buf[i], b = buf[i + lag];
        sum += a * b; e1 += a * a; e2 += b * b;
      }
      var norm = Math.sqrt(e1 * e2);
      var corr = norm > 0 ? sum / norm : 0;
      if (corr > best) { best = corr; bestLag = lag; }
    }
    if (bestLag < 0 || best < 0.5) return null;
    return sampleRate / bestLag;
  }

  function runSpeech(o) {
    var dur = o.duration || 10000;
    var cancelled = false, finished = false;
    var stream, ctx, analyser, src, iv, timer;
    var frames = [], f0s = [], start = 0;
    var buf, innerSettle = null;

    // A machine with no input device can leave getUserMedia pending forever, which
    // would freeze the test with no message. Race it against a hard timeout.
    var micTimedOut = false;
    var pendingMic = (navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
      ? navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } })
      : Promise.reject(new Error("no_media"));
    var ready = Promise.race([
      pendingMic,
      new Promise(function (_, rej) {
        setTimeout(function () { micTimedOut = true; rej(new Error("mic_unavailable")); }, 8000);
      })
    ]);
    pendingMic.then(function (late) {
      if (!micTimedOut) return;
      try { late.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    }, function () {});

    var promise = ready.then(function (s) {
      stream = s;
      var AC = root.AudioContext || root.webkitAudioContext;
      ctx = new AC();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.15;
      src = ctx.createMediaStreamSource(stream);
      src.connect(analyser);
      buf = new Float32Array(analyser.fftSize);
      start = performance.now();

      return new Promise(function (resolve) {
        innerSettle = resolve;
        iv = setInterval(function () {
          analyser.getFloatTimeDomainData(buf);
          var sum = 0;
          for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          var rms = Math.sqrt(sum / buf.length);
          frames.push(rms);
          if (rms > 0.012) {
            var f0 = autocorrelateF0(buf, ctx.sampleRate);
            if (f0 && f0 > 70 && f0 < 400) f0s.push(f0);
          }
          if (o.onLevel) o.onLevel(clamp(rms * 12, 0, 1));
          if (performance.now() - start >= dur && !finished) finish(resolve);
        }, 40);

        timer = setTimeout(function () { if (!finished) finish(resolve); }, dur + 800);
      });
    }).catch(function (err) {
      return { error: err && err.message ? err.message : "mic_failed" };
    });

    function finish(resolve) {
      finished = true;
      clearInterval(iv); clearTimeout(timer);
      try { if (src) src.disconnect(); } catch (e) {}
      try { if (ctx) ctx.close(); } catch (e) {}
      try { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}

      if (cancelled) { resolve({ cancelled: true }); return; }

      var p90 = percentile(frames, 0.9);
      var thr = Math.max(0.012, p90 * 0.32);
      var voiced = frames.filter(function (v) { return v >= thr; }).length;
      var pauseRatio = frames.length ? 1 - voiced / frames.length : 1;

      // Syllable peaks: local maxima with a 200 ms refractory period.
      var peaks = 0;
      var minGap = Math.max(2, Math.round(200 / 40));
      for (var i = 1; i < frames.length - 1; i++) {
        if (frames[i] > thr && frames[i] >= frames[i - 1] && frames[i] > frames[i + 1]) {
          if (i - lastPeak >= minGap) { peaks++; lastPeak = i; }
        }
      }
      var seconds = frames.length * 0.04;
      var rate = seconds > 0 ? peaks / seconds : 0;

      var st = f0s.map(function (f) { return 12 * Math.log(f) / Math.LN2; });
      var f0Sd = st.length >= 8 ? sd(st) : null;

      var ok = p90 > 0.02 && voiced / Math.max(1, frames.length) > 0.25 && peaks >= 5;
      resolve({
        metrics: {
          speechRate: round2(rate),
          pauseRatio: round2(pauseRatio * 100),
          f0Sd: f0Sd === null ? null : round2(f0Sd)
        },
        quality: {
          ok: ok,
          level: ok && f0Sd !== null ? "high" : ok ? "fair" : "low",
          notes: p90 <= 0.02 ? ["too_quiet"] : peaks < 5 ? ["too_short"] : []
        }
      });
    }

    var lastPeak = -99;
    return {
      promise: promise,
      cancel: function () {
        cancelled = true;
        if (innerSettle) finish(innerSettle);
        else {
          try { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
          try { if (ctx) ctx.close(); } catch (e) {}
        }
      }
    };
  }

  /* ---------------- balance / sway ---------------- */

  function motionSupported() {
    return typeof root.DeviceMotionEvent !== "undefined";
  }

  function requestMotion() {
    if (typeof root.DeviceMotionEvent !== "undefined" &&
        typeof root.DeviceMotionEvent.requestPermission === "function") {
      return root.DeviceMotionEvent.requestPermission().then(function (r) { return r === "granted"; })
        .catch(function () { return false; });
    }
    return Promise.resolve(motionSupported());
  }

  function runBalance(o) {
    var dur = o.duration || 20000;
    var samples = [], cancelled = false, finished = false;
    var start = performance.now(), timer, iv;
    var lp = 1, noDataTimer = null, noDataError = false;

    function onMotion(e) {
      var a = e.accelerationIncludingGravity || e.acceleration;
      if (!a || a.x === null) return;
      var mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) / 9.80665;
      lp = lp * 0.9 + mag * 0.1;
      var lin = mag - lp;
      samples.push({ t: performance.now() - start, lin: lin, mag: mag });
    }

    if (!motionSupported()) {
      return { promise: Promise.resolve({ error: "no_motion" }), cancel: function () {} };
    }

    root.addEventListener("devicemotion", onMotion);

    // Desktop browsers expose DeviceMotionEvent but never fire it. Without this
    // guard the test would sit at 20 s and then report a meaningless zero.
    noDataTimer = setTimeout(function () {
      if (!finished && samples.length < 5) { noDataError = true; finish(); }
    }, 4000);

    var settle = null;

    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(timer); clearTimeout(noDataTimer); clearInterval(iv);
      root.removeEventListener("devicemotion", onMotion);
      if (!settle) return;
      if (cancelled) { settle({ cancelled: true }); return; }
      if (noDataError) { settle({ error: "no_motion_data" }); return; }

      var lin = samples.map(function (s) { return s.lin; });
      var rms = sd(lin) * 1000;
      var path = 0;
      for (var i = 1; i < lin.length; i++) path += Math.abs(lin[i] - lin[i - 1]);
      var jerk = 0;
      for (var j = 2; j < samples.length; j++) {
        var dt = (samples[j].t - samples[j - 1].t) / 1000 || 0.02;
        jerk += Math.abs((lin[j] - lin[j - 1]) - (lin[j - 1] - lin[j - 2])) / dt;
      }
      var ok = samples.length > 150 && rms < 400;
      settle({
        metrics: { swayRms: round2(rms), swayPath: round2(path * 1000), swayJerk: round2(jerk) },
        quality: {
          ok: ok,
          level: samples.length > 400 && rms < 120 ? "high" : ok ? "fair" : "low",
          notes: samples.length <= 150 ? ["too_few_samples"] : rms >= 400 ? ["moving"] : []
        }
      });
    }

    var promise = new Promise(function (resolve) {
      settle = resolve;
      timer = setTimeout(finish, dur);
      iv = setInterval(function () {
        if (o.onTick) o.onTick({ t: (performance.now() - start) / 1000, n: samples.length, last: samples.length ? samples[samples.length - 1].lin : 0 });
      }, 120);
    });

    return {
      promise: promise,
      cancel: function () {
        cancelled = true;
        finish();
      }
    };
  }

  /* ---------------- choice reaction time ---------------- */

  function runRT(o) {
    var trials = o.trials || 12;
    var cancelled = false, finished = false;
    var results = [], i = 0, timer = null, armed = false;
    var t0 = 0, side = 1, settle = null;

    function next() {
      if (finished) return;
      if (cancelled) { settle({ cancelled: true }); return; }
      if (i >= trials) { done(); return; }
      o.onTrial({ phase: "wait", index: i, total: trials });
      var delay = 600 + Math.random() * 900;
      timer = setTimeout(function () {
        if (cancelled) return;
        armed = true;
        side = Math.random() < 0.5 ? -1 : 1;
        t0 = performance.now();
        o.onTrial({ phase: "go", index: i, total: trials, side: side });
      }, delay);
    }

    function answer(chosen) {
      if (finished || cancelled) return;
      // Taps while waiting for the cue, or during the gap between trials, are
      // fidgeting rather than answers: ignore them instead of burning a trial.
      if (!armed) return;
      var rt = performance.now() - t0;
      if (rt < 120) return; // anticipation; keep waiting for a real response
      results.push({ rt: rt, ok: chosen === side });
      armed = false;
      i++;
      o.onTrial({ phase: "gap", index: i, total: trials, last: results[results.length - 1] });
      setTimeout(next, 420);
    }

    function done() {
      finished = true;
      var good = results.filter(function (r) { return r.ok && r.rt; }).map(function (r) { return r.rt; });
      var errors = results.filter(function (r) { return !r.ok; }).length;
      if (good.length < 5) { settle({ error: "too_few_trials" }); return; }
      var med = median(good);
      var cv = sd(good) / mean(good);
      settle({
        metrics: { rtMedian: Math.round(med), rtCv: round2(cv * 100), rtErrors: errors },
        quality: {
          // A handful of anticipation taps is normal; keep the measurement and
          // flag it rather than throwing away the session.
          ok: good.length >= 5,
          level: good.length >= 8 && errors <= 1 ? "high" : errors <= 3 ? "fair" : "low",
          notes: errors > 3 ? ["many_errors"] : []
        }
      });
    }

    var promise = new Promise(function (resolve) { settle = resolve; next(); });

    return {
      promise: promise,
      answer: answer,
      cancel: function () {
        cancelled = true; armed = false; clearTimeout(timer);
        if (!finished) { finished = true; settle({ cancelled: true }); }
      }
    };
  }

  /* ---------------- face & eyes (camera) ---------------- */

  var MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
  var VISION_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

  var landmarkerCache = null;
  var landmarkerFailed = false;

  function loadFaceModel() {
    if (landmarkerCache) return Promise.resolve(landmarkerCache);
    if (landmarkerFailed) return Promise.reject(new Error("model_unavailable"));
    return import(VISION_URL).then(function (mod) {
      var fileset = mod.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      return mod.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: false
      });
    }).then(function (lm) {
      landmarkerCache = lm;
      return lm;
    }).catch(function (e) {
      landmarkerFailed = true;
      throw e;
    });
  }

  function runFace(o) {
    var dur = o.duration || 8000;
    var video = o.video, canvas = o.canvas;
    var cancelled = false, finished = false;
    var stream, lm = null, raf = null, timer = null;
    var asym = [], jitterX = [], jitterY = [], earVals = [], lights = [];
    var lastVideoTime = -1, reduced = false, start = 0, faceResolve = null;
    var g2d = canvas ? canvas.getContext("2d", { willReadFrequently: true }) : null;
    var prevFrame = null;

    var camTimedOut = false;
    var pendingCam = (navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
      ? navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } })
      : Promise.reject(new Error("no_media"));
    pendingCam.then(function (late) {
      if (!camTimedOut) return;
      try { late.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    }, function () {});
    var promise = Promise.race([
      pendingCam,
      new Promise(function (_, rej) {
        setTimeout(function () { camTimedOut = true; rej(new Error("camera_unavailable")); }, 8000);
      })
    ])
        .then(function (s) {
          stream = s;
          video.srcObject = s;
          video.muted = true;
          video.playsInline = true;
          return video.play();
        })
        .then(function () {
          start = performance.now();
          var modelP = Promise.race([
            loadFaceModel(),
            new Promise(function (_, rej) { setTimeout(function () { rej(new Error("model_timeout")); }, 7000); })
          ]).then(function (m) { lm = m; return m; }).catch(function () { reduced = true; return null; });

          return modelP.then(function () {
            return new Promise(function (resolve) {
              faceResolve = resolve;
              loop();
              timer = setTimeout(function () { finish(resolve); }, dur);
            });
          });
        })
        .catch(function (err) {
          return { error: err && err.name === "NotAllowedError" ? "camera_blocked" : "camera_failed" };
        });

    function loop() {
      if (finished) return;
      raf = requestAnimationFrame(loop);
      if (!canvas || !g2d || !video.videoWidth) return;
      if (video.videoWidth !== canvas.width) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }

      if (lm) {
        if (video.currentTime === lastVideoTime) return;
        lastVideoTime = video.currentTime;
        var res;
        try { res = lm.detectForVideo(video, performance.now()); } catch (e) { return; }
        g2d.drawImage(video, 0, 0, canvas.width, canvas.height);
        var pts = res && res.faceLandmarks && res.faceLandmarks[0];
        if (pts && pts.length > 400) {
          var w = canvas.width, h = canvas.height;
          var L = function (i) { return { x: pts[i].x * w, y: pts[i].y * h }; };
          var eyeL = L(33), eyeR = L(263);
          var iod = Math.abs(eyeR.x - eyeL.x) || 1;
          var mouthL = L(61), mouthR = L(291);
          var browL = L(105), browR = L(334);
          var nose = L(1);

          asym.push(Math.abs(mouthL.y - mouthR.y) / iod);
          asym.push(Math.abs(browL.y - browR.y) / iod * 0.6);
          jitterX.push(nose.x / iod);
          jitterY.push(nose.y / iod);

          // Eye aspect ratio from the vertical lid pair and horizontal corners.
          var eL = (Math.abs(L(159).y - L(145).y) + Math.abs(L(158).y - L(153).y)) / (2 * (Math.abs(L(133).x - L(33).x) || 1));
          var eR = (Math.abs(L(386).y - L(374).y) + Math.abs(L(385).y - L(380).y)) / (2 * (Math.abs(L(362).x - L(263).x) || 1));
          earVals.push((eL + eR) / 2);

          if (o.onStatus) o.onStatus({ face: true, light: lightOf(g2d, canvas) });
        } else if (o.onStatus) {
          o.onStatus({ face: false });
        }
      } else {
        // Reduced mode: no landmarks, so only stability and light are measured.
        g2d.drawImage(video, 0, 0, canvas.width, canvas.height);
        var data = g2d.getImageData(0, 0, canvas.width, canvas.height).data;
        var lum = 0, motion = 0;
        for (var i = 0; i < data.length; i += 40) {
          var v = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
          lum += v;
          if (prevFrame && prevFrame.length > i) motion += Math.abs(v - prevFrame[i]);
        }
        lights.push(lum / (data.length / 40));
        asym.push(motion / (data.length / 40) * 40);
        prevFrame = [];
        for (var k = 0; k < data.length; k += 40) {
          prevFrame[k] = (data[k] * 0.299 + data[k + 1] * 0.587 + data[k + 2] * 0.114) / 255;
        }
        if (o.onStatus) o.onStatus({ face: false, reduced: true });
      }
    }

    function finish(resolve) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
      try { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}

      if (cancelled) return resolve({ cancelled: true });

      var metrics = {}, notes = [];
      if (lm) {
        metrics.faceAsym = round2(mean(asym) * 100);
        metrics.headJitter = round2((sd(jitterX) + sd(jitterY)) * 100);
        var blinks = countBlinks(earVals);
        var secs = Math.max(1, (performance.now() - start) / 1000);
        metrics.blinkRate = Math.round(blinks / secs * 60);
        notes = metrics.faceAsym > 6 ? ["asymmetry"] : [];
      } else {
        metrics.headJitter = round2(sd(asym) * 100);
        metrics.light = round2(mean(lights) * 100);
        notes = ["reduced_precision"];
      }

      resolve({
        metrics: metrics,
        reduced: !lm,
        quality: {
          ok: lm ? asym.length > 20 : false,
          level: lm && asym.length > 40 ? "fair" : "low",
          notes: notes
        }
      });
    }

    return {
      promise: promise,
      cancel: function () {
        cancelled = true;
        if (raf) cancelAnimationFrame(raf);
        try { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        if (faceResolve) finish(faceResolve);
      }
    };
  }

  function lightOf(g2d, canvas) {
    try {
      var d = g2d.getImageData(0, 0, canvas.width, canvas.height).data;
      var s = 0, n = 0;
      for (var i = 0; i < d.length; i += 160) { s += (d[i] + d[i + 1] + d[i + 2]) / 765; n++; }
      return Math.round((s / n) * 100);
    } catch (e) { return null; }
  }

  function countBlinks(ear) {
    if (ear.length < 10) return 0;
    var med = median(ear);
    var thr = med * 0.72;
    var count = 0, inBlink = false;
    for (var i = 0; i < ear.length; i++) {
      if (!inBlink && ear[i] < thr) { inBlink = true; count++; }
      else if (inBlink && ear[i] > thr * 1.06) { inBlink = false; }
    }
    return Math.max(0, count - 1);
  }

  function percentile(arr, p) {
    if (!arr.length) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var i = clamp(Math.round((a.length - 1) * p), 0, a.length - 1);
    return a[i];
  }

  function round2(v) { return Math.round(v * 100) / 100; }

  root.BGSensors = {
    runTap: runTap, runSpeech: runSpeech, runBalance: runBalance, runRT: runRT, runFace: runFace,
    requestMotion: requestMotion, motionSupported: motionSupported,
    loadFaceModel: loadFaceModel, sd: sd, median: median, mean: mean
  };
})(typeof self !== "undefined" ? self : this);
