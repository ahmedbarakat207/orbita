import '@fortawesome/fontawesome-free/css/all.min.css';
import './style.css';
import { BleService } from './services/bleService.js';
import { SerialService } from './services/serialService.js';
import { RppgService } from './services/rppgService.js';
import { TrendHistoryChart } from './components/trendHistoryChart.js';
import { SessionRecorder } from './services/sessionRecorder.js';
import { physiologicalEngine } from './services/physiologicalEngine.js';
import { DeviceManager } from './services/deviceManager.js';
import { UserManager } from './services/userManager.js';
import { BodyStatusFigure } from './components/bodyStatusFigure.js';
import { TerminalLogger } from './components/terminalLogger.js';
import { DeviceSettingsModal } from './components/deviceSettingsModal.js';
import { AddUserModal } from './components/addUserModal.js';
import { NotificationDispatcher } from './services/notificationDispatcher.js';

// 'sensor' = direct hardware channel; 'est' = calculated estimate
const VITALS_DEF = [
  { id: 'hr', name: 'Heart rate', unit: 'BPM', icon: 'fa-heart-pulse', src: 'sensor',
    fmt: (v) => Math.round(v),
    note: (v) => (v < 60 ? 'Bradycardia' : v > 100 ? 'Tachycardia' : 'Normal sinus'),
    level: (v) => (v > 100 ? 'critical-state' : v > 85 ? 'warning-state' : '') },
  { id: 'spo2', name: 'Blood oxygen', unit: '%', icon: 'fa-lungs', src: 'sensor',
    fmt: (v) => Math.round(v),
    note: (v, s) => {
      if (s?.spo2Measuring) return 'Optical sampling in progress...';
      if (s?.spo2Timestamp) {
        const measuredDate = new Date(s.spo2Timestamp.replace(' ', 'T'));
        const diffMins = Math.max(0, Math.round((Date.now() - measuredDate.getTime()) / 60000));
        const ageStr = diffMins < 1 ? 'Just now' : diffMins < 60 ? `${diffMins}m ago` : `${Math.round(diffMins / 60)}h ago`;
        return `Sampled ${s.spo2Timestamp.slice(11, 16)} (${ageStr})`;
      }
      return v >= 95 ? 'Optimal perfusion' : 'Hypoxia alert';
    },
    level: (v) => (v < 94 ? 'critical-state' : v < 96 ? 'warning-state' : '') },
  { id: 'stress', name: 'Stress', unit: '/100', icon: 'fa-gauge-high', src: 'sensor',
    fmt: (v) => Math.round(v),
    note: (v, s) => {
      const mode = s?.stressMode === 'live_optical' ? 'Live autonomic tone' : 'Optical PPG';
      if (v <= 35) return `Relaxed · ${mode}`;
      if (v <= 55) return `Nominal · ${mode}`;
      if (v <= 75) return `Medium stress · ${mode}`;
      return `High stress · ${mode}`;
    },
    level: (v) => (v > 65 ? 'critical-state' : v > 40 ? 'warning-state' : '') },
  { id: 'hrv', name: 'HRV (SDNN)', unit: 'ms', icon: 'fa-bolt', src: 'sensor',
    fmt: (v) => Math.round(v),
    note: () => 'Optical beat interval',
    level: () => '' },
  { id: 'bp', name: 'Blood pressure', unit: 'mmHg', icon: 'fa-droplet', src: 'est',
    level: () => '' },
  { id: 'map', name: 'Mean art. press.', unit: 'mmHg', icon: 'fa-gauge', src: 'est',
    fmt: (v) => Math.round(v),
    note: () => 'Perfusion pressure',
    level: () => '' },
  { id: 'respRate', name: 'Respiration', unit: 'BrPM', icon: 'fa-wind', src: 'est',
    fmt: (v) => Math.round(v),
    note: () => 'RSA coupled',
    level: () => '' },
  { id: 'temp', name: 'Body temp', unit: '°C', icon: 'fa-temperature-half', src: 'est',
    fmt: (v) => v.toFixed(1),
    note: () => 'Metabolic model',
    level: (v) => (v > 38 ? 'critical-state' : v > 37.5 ? 'warning-state' : '') }
];

const EMPTY_VITALS = () => ({
  hr: null, hrv: null, spo2: null, stress: null,
  respRate: null, bpSys: null, bpDia: null, map: null, temp: null
});

class App {
  constructor() {
    this.deviceManager = new DeviceManager(() => this.handleDeviceManagerUpdate());
    this.userManager = new UserManager(this.deviceManager, () => this.handleDeviceManagerUpdate());
    this.notificationDispatcher = new NotificationDispatcher(null);
    this.activeHardwareSource = null;
    this.isOffWrist = false;
    this.lastLogThrottle = 0;

    this.render();
    this.initBodyStatusFigure();
    this.initTerminalLogger();
    this.initTrendChart();
    this.initSessionRecorder();
    this.initSettingsModal();
    this.initHardware();
    this.updateDisplay();

    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  render() {
    const boxes = VITALS_DEF.map((v) => `
      <div class="vital-box" id="box-${v.id}">
        <div class="vital-label-row">
          <span class="vital-name">${v.name}${v.src === 'est' ? ' (est.)' : ''}</span>
          <span class="vital-icon"><i class="fa-solid ${v.icon}"></i></span>
        </div>
        <div class="vital-value-row">
          <span class="vital-number" id="val-${v.id}">--</span>
          <span class="vital-unit">${v.unit}</span>
        </div>
        <div class="vital-status-sub" id="sub-${v.id}"></div>
      </div>`).join('');

    const activity = [
      ['steps', 'Steps', ''],
      ['distanceMeters', 'Distance', 'm'],
      ['caloriesKcal', 'Calories', 'kcal'],
      ['batt', 'Watch battery', '%']
    ].map(([k, label, unit]) => `
      <div class="vital-box" id="box-act-${k}">
        <div class="vital-label-row"><span class="vital-name">${label}</span></div>
        <div class="vital-value-row">
          <span class="vital-number" id="act-${k}">--</span>
          <span class="vital-unit">${unit}</span>
        </div>
      </div>`).join('');

    document.querySelector('#app').innerHTML = `
      <header class="mission-header">
        <div class="header-top-row">
          <div class="brand-group">
            <div class="brand-text">
              <h1>ORBITA</h1>
            </div>
          </div>

          <div class="header-telemetry-pills">
            <!-- Multi-Watch Selector Pills -->
            <div class="watch-selector-pills" id="watch-selector-mount">
              <!-- Rendered dynamically -->
            </div>

            <!-- Emergency Alerts & Notification Permission Pill -->
            <button class="watch-pill notif-pill" id="btn-toggle-notifs" title="Click to allow OS notifications & emergency sound">
              <span class="pill-dot" id="notif-pill-dot"></span>
              <i class="fa-solid fa-bell"></i>
              <span id="notif-pill-text">ENABLE ALERTS</span>
            </button>

            <!-- Settings Launcher Button -->
            <button class="icon-action-btn btn-hardware-io" id="btn-open-settings" title="Open Watch Settings & Manager">
              <i class="fa-solid fa-sliders"></i>
              <span id="settings-btn-label">WATCH SETTINGS</span>
            </button>
          </div>
        </div>
      </header>

      <main class="dashboard-container">
        <div class="dashboard-main-grid">
          <!-- LEFT COLUMN: Telemetry, Activity, Trend, Terminal -->
          <div class="dashboard-telemetry-col">
            <!-- Vitals Grid (4x2 Matrix) -->
            <section class="console-panel">
              <div class="panel-header">
                <h2><i class="fa-solid fa-heart-pulse"></i> // PHYSIOLOGICAL VITALS</h2>
                <span class="header-tag" id="active-watch-tag">[ ORBITA 1 · LIVE ]</span>
              </div>
              <div class="panel-body">
                <div class="vitals-grid">${boxes}</div>
              </div>
            </section>

            <!-- Activity Grid (4 Tiles) -->
            <section class="console-panel">
              <div class="panel-header">
                <h2><i class="fa-solid fa-person-walking"></i> // ACTIGRAPHY & POWER</h2>
              </div>
              <div class="panel-body">
                <div class="vitals-grid">${activity}</div>
              </div>
            </section>

            <!-- Trend Chart (5-Min Rolling Oscilloscope) -->
            <section class="console-panel telemetry-vault-panel">
              <div class="panel-header">
                <div class="vault-header-title">
                  <h2><i class="fa-solid fa-chart-line"></i> // 5-MIN TREND OSCILLOSCOPE</h2>
                </div>
                <div class="trend-channel-pills">
                  <button class="trend-pill active" data-channel="hr"><span class="pill-dot" style="background:#eaeaea"></span> HR</button>
                  <button class="trend-pill active" data-channel="spo2"><span class="pill-dot" style="background:#4af626"></span> SpO₂</button>
                  <button class="trend-pill active" data-channel="stress"><span class="pill-dot" style="background:#f59e0b"></span> STRESS</button>
                  <button class="trend-pill" data-channel="hrv"><span class="pill-dot" style="background:#ff2a2a"></span> HRV</button>
                </div>
              </div>
              <div class="panel-body vault-panel-body">
                <div class="trend-canvas-wrap"><canvas id="trend-canvas"></canvas></div>
                <div class="vault-toolbar">
                  <div class="vault-toolbar-left">
                    <button class="vault-btn primary" id="btn-session-record">
                      <i class="fa-solid fa-circle-dot" id="rec-btn-icon"></i>
                      <span id="rec-btn-label">RECORD</span>
                    </button>
                    <div class="vault-status-chip" id="session-status-chip">
                      <span id="session-status-text">Not recording</span>
                    </div>
                  </div>
                  <div class="vault-toolbar-right">
                    <button class="vault-btn secondary" id="btn-session-export-csv"><i class="fa-solid fa-file-csv"></i> CSV</button>
                    <button class="vault-btn secondary" id="btn-session-export-json"><i class="fa-solid fa-file-code"></i> JSON</button>
                  </div>
                </div>
              </div>
            </section>

            <!-- FULL TERMINAL LOGGER -->
            <div id="terminal-logger-mount"></div>
          </div>

          <!-- RIGHT COLUMN: Biometric Anatomical Human Status Figure -->
          <div class="dashboard-body-col">
            <div id="body-status-mount"></div>
          </div>
        </div>
      </main>

      <div id="modal-container"></div>
    `;

    document.querySelector('#btn-open-settings')?.addEventListener('click', () => {
      this.settingsModal.open();
    });

    // Alert & Desktop Notification toggle
    const notifBtn = document.querySelector('#btn-toggle-notifs');
    const notifText = document.querySelector('#notif-pill-text');
    const notifDot = document.querySelector('#notif-pill-dot');

    const updateNotifUi = () => {
      const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
      if (notifBtn && notifText) {
        if (perm === 'granted') {
          notifBtn.classList.add('connected');
          if (notifDot) notifDot.style.background = '#10b981';
          notifText.textContent = 'ALERTS: ACTIVE';
        } else if (perm === 'denied') {
          notifBtn.classList.remove('connected');
          if (notifDot) notifDot.style.background = '#ef4444';
          notifText.textContent = 'ALERTS: BLOCKED';
        } else {
          notifBtn.classList.remove('connected');
          if (notifDot) notifDot.style.background = '#f59e0b';
          notifText.textContent = 'ENABLE ALERTS';
        }
      }
    };

    updateNotifUi();

    window.testDangerNotification = () => {
      const activeUser = this.userManager.getActiveUser();
      const activeDev = this.deviceManager.getActiveDevice();
      this.notificationDispatcher.dispatchDesktopNotification({
        userName: activeUser?.name || 'Ahmed',
        deviceName: activeDev?.customName || 'Orbita Watch',
        vitals: { hr: 142, spo2: 88, stress: 85 },
        reasonsStr: 'Critical SpO2 (88% < 90%) — Acute Hypoxia Risk'
      });
      this.notificationDispatcher.dispatchWatchHardwareAlert({
        reasonsStr: 'Critical SpO2 (88% < 90%) — Hypoxia Risk',
        vitals: { hr: 142, spo2: 88, stress: 85 }
      });
    };

    notifBtn?.addEventListener('click', async () => {
      const res = await this.notificationDispatcher.requestPermission();
      updateNotifUi();
      if (res === 'granted') {
        const activeUser = this.userManager.getActiveUser();
        const activeDev = this.deviceManager.getActiveDevice();
        this.notificationDispatcher.dispatchDesktopNotification({
          userName: activeUser?.name || 'Ahmed',
          deviceName: activeDev?.customName || 'Orbita Watch',
          vitals: { hr: 142, spo2: 88, stress: 85 },
          reasonsStr: 'Critical SpO2 (88% < 90%) — Acute Hypoxia Risk'
        });
        this.notificationDispatcher.dispatchWatchHardwareAlert({
          reasonsStr: 'Critical SpO2 (88% < 90%) — Hypoxia Risk',
          vitals: { hr: 142, spo2: 88, stress: 85 }
        });
      }
    });

    this.renderUserAndDeviceSelectorPills();
  }

  renderUserAndDeviceSelectorPills() {
    const mount = document.querySelector('#watch-selector-mount');
    if (!mount) return;

    const users = this.userManager.getAllUsers();
    const activeUser = this.userManager.getActiveUser();
    const ws = this.bleService?.watchState || {};

    const pillsHtml = users.map((u) => {
      const isUserActive = activeUser && activeUser.id === u.id;
      const dev = u.assignedDeviceId ? this.deviceManager.devices.get(u.assignedDeviceId) : null;
      const isConnected = dev && (dev.connected || (dev.sourceType === 'bridge' && Boolean(ws.connected)));
      const hrVal = dev?.vitals?.hr;
      const hrText = hrVal > 0 ? `${Math.round(hrVal)} BPM` : (isConnected ? 'SYNC' : (dev ? 'OFFLINE' : 'NO SENSOR'));
      const battVal = ws.batt ?? dev?.activity?.batt;
      const battText = battVal !== null && battVal !== undefined ? `${battVal}%` : '';

      return `
        <button class="watch-pill user-pill ${isUserActive ? 'active' : ''} ${isConnected ? 'connected' : ''}" data-user-id="${u.id}" title="${this.escapeHtml(u.role || 'Subject')} · ${dev ? dev.customName : 'Unassigned'}">
          <span class="pill-dot"></span>
          <i class="fa-solid fa-user"></i>
          <strong>${this.escapeHtml(u.name)}:</strong>
          <span>${hrText}${battText ? ' · ' + battText : ''}</span>
        </button>
      `;
    }).join('');

    mount.innerHTML = pillsHtml + `
      <button class="watch-pill btn-header-add-user" id="btn-header-add-user" title="Register new user or astronaut profile">
        <i class="fa-solid fa-user-plus"></i> ADD USER
      </button>
    `;

    mount.querySelectorAll('.watch-pill[data-user-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.userManager.setActiveUser(btn.dataset.userId);
        this.updateDisplay();
      });
    });

    mount.querySelector('#btn-header-add-user')?.addEventListener('click', () => {
      this.addUserModal.open();
    });
  }

  initBodyStatusFigure() {
    const mount = document.querySelector('#body-status-mount');
    if (mount) {
      this.bodyStatus = new BodyStatusFigure(mount);
    }
  }

  initTerminalLogger() {
    const mount = document.querySelector('#terminal-logger-mount');
    if (mount) {
      this.terminalLogger = new TerminalLogger(mount);
    }
  }

  initTrendChart() {
    const canvas = document.querySelector('#trend-canvas');
    if (canvas) {
      this.trendChart = new TrendHistoryChart(canvas, { maxPoints: 300 });
      if (this.trendChart.channels.rr?.enabled) this.trendChart.toggleChannel('rr');
      document.querySelectorAll('.trend-pill').forEach((pill) => {
        pill.addEventListener('click', () => {
          pill.classList.toggle('active', this.trendChart.toggleChannel(pill.dataset.channel));
        });
      });
    }
  }

  initSessionRecorder() {
    const recBtn = document.querySelector('#btn-session-record');
    const recLabel = document.querySelector('#rec-btn-label');
    const recIcon = document.querySelector('#rec-btn-icon');
    const statusText = document.querySelector('#session-status-text');

    this.sessionRecorder = new SessionRecorder((state) => {
      if (statusText) {
        statusText.textContent = state.isRecording
          ? `Recording · ${state.durationSec}s · ${state.totalFrames} frames`
          : state.totalFrames ? `${state.totalFrames} frames saved` : 'Not recording';
      }
      if (recBtn && recLabel && recIcon) {
        recBtn.classList.toggle('active-recording', state.isRecording);
        recLabel.textContent = state.isRecording ? 'STOP' : 'RECORD';
        recIcon.className = state.isRecording ? 'fa-solid fa-stop' : 'fa-solid fa-circle-dot';
      }
    });

    recBtn?.addEventListener('click', () => {
      if (this.sessionRecorder.isRecording) this.sessionRecorder.stopRecording();
      else this.sessionRecorder.startRecording();
    });
    document.querySelector('#btn-session-export-csv')?.addEventListener('click', () => {
      if (this.sessionRecorder.getSampleCount() > 0) this.sessionRecorder.exportCSV();
    });
    document.querySelector('#btn-session-export-json')?.addEventListener('click', () => {
      if (this.sessionRecorder.getSampleCount() > 0) this.sessionRecorder.exportJSON();
    });
  }

  initSettingsModal() {
    const mount = document.querySelector('#modal-container');
    this.addUserModal = new AddUserModal(
      mount,
      this.userManager,
      this.deviceManager,
      this.bleService,
      (newUser) => this.handleUserCreated(newUser)
    );
    this.settingsModal = new DeviceSettingsModal(
      mount,
      this.deviceManager,
      this.userManager,
      this.bleService,
      () => this.handleDeviceManagerUpdate(),
      () => this.addUserModal.open()
    );
  }

  handleUserCreated(newUser) {
    if (this.terminalLogger && newUser) {
      this.terminalLogger.logEntry({
        deviceName: newUser.name,
        eventMessage: `NEW SUBJECT REGISTERED: ${newUser.name} (${newUser.role})`
      });
    }
    this.handleDeviceManagerUpdate();
  }

  initHardware() {
    const handleData = (data) => {
      const activeDev = this.deviceManager.getActiveDevice();
      if (!activeDev) return;

      if (data.finger !== undefined) {
        activeDev.isOffWrist = !data.finger;
        this.isOffWrist = activeDev.isOffWrist;
      }

      // Update activity
      if (data.steps !== undefined && data.steps !== null) activeDev.activity.steps = data.steps;
      if (data.distanceMeters !== undefined && data.distanceMeters !== null) activeDev.activity.distanceMeters = data.distanceMeters;
      if (data.caloriesKcal !== undefined && data.caloriesKcal !== null) activeDev.activity.caloriesKcal = data.caloriesKcal;
      if (data.cadenceSpm !== undefined && data.cadenceSpm !== null) activeDev.activity.cadenceSpm = data.cadenceSpm;
      if (data.batt !== undefined && data.batt !== null) activeDev.activity.batt = data.batt;
      activeDev.connected = true;

      const v = activeDev.vitals;

      if (this.isOffWrist) {
        Object.assign(v, EMPTY_VITALS());
        physiologicalEngine.reset();
      } else {
        if (data.hr > 0) v.hr = data.hr; else if (data.hr === 0) v.hr = null;
        if (data.hrv > 0) v.hrv = data.hrv;
        if (data.spo2 > 0) {
          v.spo2 = data.spo2;
          if (data.spo2Timestamp) v.spo2Timestamp = data.spo2Timestamp;
        }
        if (data.stress > 0) {
          v.stress = Math.round(data.stress);
          if (data.stressTimestamp) v.stressTimestamp = data.stressTimestamp;
          if (data.stressMode) v.stressMode = data.stressMode;
        }
        if (data.rr > 0) v.respRate = data.rr;
        if (data.temp > 0) v.temp = data.temp;
        if (data.bpSys > 0) { v.bpSys = data.bpSys; v.bpDia = data.bpDia || null; }

        // Continuous physiological derivation
        const est = v.hr > 0
          ? physiologicalEngine.derive({ hr: v.hr, stress: v.stress, caloriesKcal: activeDev.activity.caloriesKcal })
          : null;

        if (est) {
          if (!(data.rr > 0)) v.respRate = est.respRate;
          if (!(data.temp > 0)) v.temp = est.temp;
          if (!(data.bpSys > 0)) { v.bpSys = est.bpSys; v.bpDia = est.bpDia; }
          v.map = est.map;
        } else if (!(v.hr > 0)) {
          v.respRate = null; v.temp = null; v.bpSys = null; v.bpDia = null; v.map = null;
        }

        if (this.trendChart) {
          this.trendChart.appendPoint({ ...v, respRate: null });
        }
      }

      if (this.sessionRecorder?.isRecording) {
        this.sessionRecorder.recordFrame(v, activeDev.customName, this.isOffWrist);
      }

      // Health evaluation
      const healthEval = this.deviceManager.evaluateHealth(v);

      const activeUser = this.userManager.getActiveUser();
      const userName = activeUser ? activeUser.name : 'SUBJECT';

      // Emergency Dispatcher (Watch Haptic Buzz, Desktop Notification, Audio Alarm, Screen Banner)
      this.notificationDispatcher.processTelemetry({
        userName,
        deviceName: activeDev.customName,
        vitals: v,
        healthEval,
        isOffWrist: this.isOffWrist
      });

      // Terminal logger streaming (throttled to ~1.2s or on status change)
      const now = Date.now();
      if (now - this.lastLogThrottle >= 1200 || healthEval.level === 'danger') {
        this.lastLogThrottle = now;
        if (this.terminalLogger) {
          this.terminalLogger.logEntry({
            deviceName: `${userName} // ${activeDev.customName}`,
            vitals: v,
            activity: activeDev.activity,
            healthEval,
            isOffWrist: this.isOffWrist
          });
        }
      }

      // Update anatomical body status map
      if (this.bodyStatus) {
        this.bodyStatus.update(v, this.isOffWrist, activeDev, activeUser);
      }

      this.updateDisplay();
    };

    const handleStatus = (status) => {
      if (status && status.state === 'connected') {
        const activeDev = this.deviceManager.getActiveDevice();
        if (activeDev) {
          activeDev.connected = true;
          if (status.deviceName) activeDev.defaultName = status.deviceName;
        }
        this.activeHardwareSource = status.deviceName || 'Orbita Watch';
        this.renderUserAndDeviceSelectorPills();
        this.updateDisplay();
      }
    };

    this.bleService = new BleService(handleData, handleStatus);
    this.notificationDispatcher.bleService = this.bleService;
    this.serialService = new SerialService(handleData, handleStatus);
    this.rppgService = new RppgService(handleData, handleStatus);

    this.bleService.autoConnectBridge().then((linked) => {
      if (linked) {
        const ws = this.bleService.watchState;
        const activeDev = this.deviceManager.getActiveDevice();
        if (activeDev) {
          activeDev.connected = true;
          if (ws.deviceName) activeDev.defaultName = ws.deviceName;
          if (ws.address) activeDev.address = ws.address;
        }
        this.activeHardwareSource = ws.deviceName || 'Orbita Watch';
        this.renderUserAndDeviceSelectorPills();
        this.updateDisplay();
      }
    });
  }

  handleDeviceManagerUpdate() {
    this.renderUserAndDeviceSelectorPills();
    this.updateDisplay();
  }

  updateDisplay() {
    const activeUser = this.userManager.getActiveUser();
    const activeDev = this.deviceManager.getActiveDevice();
    const connected = Boolean(activeDev && activeDev.connected);
    const emptyNote = !connected ? 'No device' : this.isOffWrist ? 'Off wrist' : 'Waiting for data';

    // Update active watch tag
    const tag = document.querySelector('#active-watch-tag');
    if (tag && activeDev) {
      const userPart = activeUser ? `👤 ${activeUser.name.toUpperCase()} · ` : '';
      tag.textContent = `[ ${userPart}${activeDev.customName.toUpperCase()} · ${connected ? 'LIVE' : 'OFFLINE'} ]`;
    }

    const s = activeDev ? activeDev.vitals : EMPTY_VITALS();

    for (const def of VITALS_DEF) {
      const valEl = document.querySelector(`#val-${def.id}`);
      const subEl = document.querySelector(`#sub-${def.id}`);
      const boxEl = document.querySelector(`#box-${def.id}`);
      if (!valEl || !subEl || !boxEl) continue;

      let text = '--';
      let note = emptyNote;
      let level = '';

      if (connected && !this.isOffWrist) {
        if (def.id === 'bp') {
          if (s.bpSys > 0 && s.bpDia > 0) {
            text = `${Math.round(s.bpSys)}/${Math.round(s.bpDia)}`;
            note = 'Estimated from HR + stress';
          }
        } else if (s[def.id] > 0) {
          const v = s[def.id];
          text = def.fmt ? def.fmt(v) : String(v);
          note = def.src === 'est' ? 'Estimated model' : def.note(v, s);
          level = def.level ? def.level(v) : '';
        }
      }

      valEl.textContent = text;
      subEl.textContent = note;
      boxEl.className = `vital-box ${text === '--' ? 'unmeasured-state' : level || (def.src === 'est' ? 'derived-state' : '')}`.trim();
    }

    // Activity boxes
    const act = activeDev ? activeDev.activity : {};
    for (const [k, v] of Object.entries(act)) {
      const el = document.querySelector(`#act-${k}`);
      if (el) el.textContent = connected && v !== null && v !== undefined ? v : '--';
    }

    this.renderUserAndDeviceSelectorPills();
  }

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
});
