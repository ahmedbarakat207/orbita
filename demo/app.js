/* ORBITA demo — mission telemetry replay over a real recorded capture. */
(function () {
  'use strict';

  var TILES = [
    { id: 'hr', lbl: 'HEART RATE', unit: 'BPM', wide: true },
    { id: 'spo2', lbl: 'SpO2', unit: '%', wide: false },
    { id: 'stress', lbl: 'AUTONOMIC STRESS', unit: '/100', wide: false },
    { id: 'hrv', lbl: 'HRV (SDNN)', unit: 'ms', wide: false },
    { id: 'batt', lbl: 'WATCH BATTERY', unit: '%', wide: false },
    { id: 'steps', lbl: 'STEPS (ALL-DAY)', unit: '', wide: false },
    { id: 'cal', lbl: 'CALORIES', unit: 'kcal', wide: false },
    { id: 'link', lbl: 'BLE LINK', unit: '', wide: true }
  ];

  var SPEEDS = [1, 10, 60];
  var state = {
    data: null,
    t: 0,
    playing: true,
    speed: 10,
    raf: null,
    lastFrame: 0
  };

  function el(id) { return document.getElementById(id); }

  function fmtTime(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return 'T+' + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  }

  function sampleAt(tMs) {
    var d = state.data;
    if (!d || !d.samples.length) return null;
    var i = 0, lo = 0, hi = d.samples.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (d.samples[mid].t <= tMs) { i = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return d.samples[i];
  }

  function buildTiles() {
    var host = el('tiles');
    host.innerHTML = '';
    TILES.forEach(function (tl) {
      var div = document.createElement('div');
      div.className = 'tile ' + tl.id + (tl.wide ? ' wide' : '');
      div.innerHTML =
        '<div class="lbl">' + tl.lbl + '</div>' +
        '<div class="val"><span id="tv-' + tl.id + '">--</span>' +
        (tl.unit ? '<small>' + tl.unit + '</small>' : '') + '</div>' +
        '<div class="stat" id="ts-' + tl.id + '">awaiting telemetry</div>';
      host.appendChild(div);
    });
  }

  function classifyStress(v) {
    if (v == null) return { cls: '', stat: 'standby' };
    if (v >= 70) return { cls: 'crit', stat: 'CRITICAL — alert dispatched' };
    if (v >= 50) return { cls: '', stat: 'ELEVATED — monitoring' };
    return { cls: '', stat: 'nominal' };
  }

  function updateTiles(s) {
    if (!s) return;
    var hr = el('tv-hr'), spo2 = el('tv-spo2'), stress = el('tv-stress'),
      hrv = el('tv-hrv'), batt = el('tv-batt'), steps = el('tv-steps'),
      cal = el('tv-cal'), link = el('tv-link'),
      sHr = el('ts-hr'), sSpo2 = el('ts-spo2'), sStress = el('ts-stress'),
      sHrv = el('ts-hrv'), sBatt = el('ts-batt'), sSteps = el('ts-steps'),
      sCal = el('ts-cal'), sLink = el('ts-link');
    if (!hr) return;

    hr.textContent = s.hr == null ? '--' : Math.round(s.hr);
    sHr.textContent = s.hr == null ? 'no optical lock (real sensor gap)' : 'optical sensor locked';

    spo2.textContent = s.spo2 == null ? '--' : Math.round(s.spo2);
    sSpo2.textContent = s.spo2 == null ? 'polled every 180s' : 'last sample in window';

    stress.textContent = s.stress == null ? '--' : Math.round(s.stress);
    var c = classifyStress(s.stress);
    sStress.textContent = c.stat;
    var stressTile = sStress.closest('.tile');
    stressTile.classList.toggle('crit', c.cls === 'crit');

    hrv.textContent = s.hrv == null ? '--' : Math.round(s.hrv);
    sHrv.textContent = s.hrv == null ? 'awaiting RR stream' : 'from reconstructed RR intervals';

    batt.textContent = s.batt == null ? '--' : Math.round(s.batt);
    sBatt.textContent = s.batt == null ? '--' : (s.batt > 20 ? 'nominal' : 'LOW');

    steps.textContent = s.steps == null ? '--' : s.steps.toLocaleString();
    sSteps.textContent = s.steps == null ? '--' : 'all-day counters';

    cal.textContent = s.cal == null ? '--' : Math.round(s.cal);
    sCal.textContent = s.cal == null ? '--' : 'expenditure';

    link.textContent = 'STREAMING';
    sLink.textContent = 'CoreBluetooth bridge · 127.0.0.1';
  }

  function drawScope() {
    var d = state.data;
    var cv = el('scope');
    if (!d || !cv) return;
    var ctx = cv.getContext('2d');
    var w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w * 2 || cv.height !== h * 2) { cv.width = w * 2; cv.height = h * 2; }
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var t0 = d.t0, t1 = d.t0 + d.span;
    var vis = t0 + state.t;
    var windowMs = d.span;
    var x = function (t) { return ((t - t0) / windowMs) * w; };
    var xVis = x(vis);

    // grid
    ctx.strokeStyle = '#161620';
    ctx.lineWidth = 1;
    for (var gy = 0; gy < 5; gy++) {
      var yy = (gy / 4) * h;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke();
    }
    for (var gx = 0; gx < 8; gx++) {
      var xx = (gx / 7) * w;
      ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, h); ctx.stroke();
    }

    function series(key, color, yMin, yMax, stepLine) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      var started = false;
      var lastPt = null;
      d.samples.forEach(function (p) {
        if (p.t > vis) return;
        var v = p[key];
        if (v == null) { started = false; lastPt = null; return; }
        var px = x(p.t);
        var py = h - 10 - ((v - yMin) / (yMax - yMin)) * (h - 20);
        if (stepLine && lastPt) {
          ctx.moveTo(lastPt.x, lastPt.y);
          ctx.lineTo(px, lastPt.y);
          ctx.lineTo(px, py);
          started = true;
        } else {
          if (!started) { ctx.moveTo(px, py); started = true; }
          else ctx.lineTo(px, py);
        }
        lastPt = { x: px, y: py };
      });
      ctx.stroke();
      if (lastPt && lastPt.x < xVis + 2) {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(lastPt.x, lastPt.y, 3, 0, 7); ctx.fill();
      }
    }

    series('hr', '#00f2fe', 40, 130, false);
    series('spo2', '#3dffa0', 88, 100, true);
    series('stress', '#ffb347', 0, 100, false);

    // replay cursor
    ctx.strokeStyle = '#e8eef5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xVis, 0); ctx.lineTo(xVis, h); ctx.stroke();

    // danger events
    (d.dangers || []).forEach(function (dt) {
      if (dt < t0 || dt > vis) return;
      ctx.strokeStyle = '#ff4d5e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x(dt), h * 0.02); ctx.lineTo(x(dt), h * 0.98); ctx.stroke();
      ctx.fillStyle = '#ff4d5e';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillText('DANGER', x(dt) + 4, 12);
    });
  }

  function frame(now) {
    var d = state.data;
    if (d && state.playing) {
      var dt = state.lastFrame ? now - state.lastFrame : 0;
      state.t += dt * state.speed;
      if (state.t >= d.span) { state.t = d.span; state.playing = false; setPlayBtn(); }
      var s = sampleAt(d.t0 + state.t);
      updateTiles(s);
      el('clock').textContent = fmtTime(state.t);
      el('scrub').value = String(Math.round((state.t / d.span) * 1000));
    }
    state.lastFrame = now;
    drawScope();
    state.raf = requestAnimationFrame(frame);
  }

  function setPlayBtn() {
    var b = el('btn-play');
    var pill = el('mode-pill');
    if (state.playing) {
      b.textContent = 'PAUSE';
      pill.innerHTML = '&#9654; REPLAY';
    } else {
      b.textContent = state.t >= (state.data ? state.data.span : 0) ? 'REPLAY' : 'RESUME';
      pill.innerHTML = '&#10074;&#10074; HELD';
    }
  }

  function init() {
    buildTiles();
    var d = window.ORBITA_REPLAY;
    var line = el('honesty-line');
    if (!d || !d.samples || !d.samples.length) {
      line.innerHTML = 'Replay data not found in this deployment (data/replay.js missing). The pipeline that generates it: Bip U &#8594; CoreBluetooth bridge &#8594; session recorder.';
      el('mode-pill').innerHTML = '&#9679; NO DATA';
      requestAnimationFrame(function t() { drawScope(); requestAnimationFrame(t); });
      return;
    }
    state.data = d;
    var when = new Date(d.t0).toISOString().slice(0, 16).replace('T', ' ');
    line.innerHTML = '&#9679; RECORDED FROM A REAL AMAZFIT BIP U on ' + when + ' UTC via the CoreBluetooth bridge — ' + d.samples.length + ' samples, ' + Math.round(d.span / 60000) + ' min. Gaps are real sensor gaps, shown unedited.';

    el('btn-play').addEventListener('click', function () {
      if (!state.playing && state.t >= d.span) state.t = 0;
      state.playing = !state.playing;
      setPlayBtn();
    });
    document.querySelectorAll('[data-speed]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.speed = Number(b.dataset.speed);
        document.querySelectorAll('[data-speed]').forEach(function (o) { o.style.borderColor = ''; o.style.color = ''; });
        b.style.borderColor = '#00f2fe55'; b.style.color = '#00f2fe';
      });
    });
    document.querySelector('[data-speed="10"]').style.borderColor = '#00f2fe55';
    document.querySelector('[data-speed="10"]').style.color = '#00f2fe';

    el('scrub').addEventListener('input', function (e) {
      state.t = (Number(e.target.value) / 1000) * d.span;
      state.playing = false;
      setPlayBtn();
      updateTiles(sampleAt(d.t0 + state.t));
      el('clock').textContent = fmtTime(state.t);
    });

    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
