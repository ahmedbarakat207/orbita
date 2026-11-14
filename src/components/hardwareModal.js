// Hardware Device Interface & Biosensor Ingestion Modal
import { sound } from '../services/sound.js';
import { SerialService } from '../services/serialService.js';

export class HardwareModal {
  constructor(containerElement, bleService, serialService, rppgService, onSourceChanged) {
    this.container = containerElement;
    this.ble = bleService;
    this.serial = serialService;
    this.rppg = rppgService;
    this.onSourceChanged = onSourceChanged;

    this.activeTab = 'bipu'; // 'bipu', 'band', 'serial', 'ble', 'rppg'
    this.serialLogs = [];
    this.latestBandData = null;
    this.copiedTimeout = null;
    this.bipuActionFeedback = '';
  }

  open(initialTab = null) {
    sound.playClick();
    if (initialTab) this.activeTab = initialTab;
    this.render();
  }

  close() {
    this.container.innerHTML = '';
  }

  updateTelemetry(data) {
    this.latestBandData = data;
    this.updateLiveBandDom();
    this.updateLiveBipUDom();
  }

  updateLiveBipUDom() {
    if (this.activeTab !== 'bipu') return;
    const ws = this.ble.watchState || {};
    const isConnected = this.ble.isConnected && Boolean(ws.connected);

    const setTxt = (sel, val) => {
      const el = this.container.querySelector(sel);
      if (el && el.textContent !== String(val)) el.textContent = String(val);
    };

    const chip = this.container.querySelector('#bipu-status-chip');
    if (chip) {
      chip.className = `status-chip-live ${isConnected ? 'connected' : 'standby'}`;
      chip.innerHTML = isConnected
        ? `<i class="fa-solid fa-link"></i> LINKED · ${ws.deviceName || 'Amazfit Bip U'} (${ws.connectionMode || 'BLE'})`
        : `<i class="fa-solid fa-satellite-dish"></i> STANDBY · SEARCHING FOR AMAZFIT BIP U`;
    }

    const wearBadge = this.container.querySelector('#bipu-wear-badge');
    if (wearBadge) {
      const worn = isConnected && ws.wearing === true;
      wearBadge.className = `contact-badge ${worn ? 'active' : 'idle'}`;
      wearBadge.innerHTML = !isConnected
        ? `<i class="fa-solid fa-circle-pause"></i> WATCH DISCONNECTED`
        : worn
          ? `<i class="fa-solid fa-heart-pulse"></i> ON-WRIST`
          : `<i class="fa-solid fa-hand"></i> OFF-WRIST DETECTED (0x0010 EVENT)`;
    }

    const n = (v, f) => (v === null || v === undefined ? '--' : f(v));
    setTxt('#bipu-hr-val', n(ws.hr > 0 ? ws.hr : null, v => `${Math.round(v)} BPM`));
    setTxt(
      '#bipu-spo2-val',
      ws.spo2 > 0
        ? `${ws.spo2}%${ws.spo2Mode ? ' · ' + ws.spo2Mode : ''}`
        : '--'
    );
    setTxt('#bipu-hrv-val', n(ws.hrv > 0 ? ws.hrv : null, v => `${v} ms`));
    setTxt(
      '#bipu-stress-val',
      ws.stress > 0
        ? `${ws.stress}/100${ws.stressMode ? ' · ' + ws.stressMode : ''}`
        : '--'
    );
    setTxt(
      '#bipu-pai-val',
      ws.paiTotal !== null && ws.paiTotal !== undefined && ws.paiTotal > 0
        ? `${ws.paiTotal} PAI${ws.standHours !== null && ws.standHours !== undefined ? ' · ' + ws.standHours + 'h' : ''}`
        : ws.standHours !== null && ws.standHours !== undefined && ws.standHours > 0
          ? `${ws.standHours}h stand`
          : '--'
    );
    setTxt('#bipu-steps-val', n(ws.steps, v => `${v}`));
    setTxt('#bipu-dist-val', n(ws.distanceMeters, v => `${v} m`));
    setTxt('#bipu-cal-val', n(ws.caloriesKcal, v => `${v} kcal`));
    setTxt('#bipu-cadence-val', n(ws.cadenceSpm > 0 ? ws.cadenceSpm : null, v => `${v} spm`));
    setTxt('#bipu-batt-val', n(ws.batt, v => `${v}%${ws.charging ? ' ⚡ CHARGING' : ''}`));
    setTxt('#bipu-clock-val', ws.watchTime || '--');
    setTxt('#bipu-last-charge-val', ws.lastChargeTime ? `${ws.lastChargeTime} (${ws.lastChargeLevel}%)` : '--');
    setTxt('#bipu-serial-val', ws.serialNumber || '--');
    setTxt('#bipu-fw-val', `${ws.firmwareRevision || '--'} / HW ${ws.hardwareRevision || '--'}`);
    setTxt('#bipu-mac-val', `${ws.address || '--'} · MTU ${ws.mtu || '--'}B`);
    setTxt('#bipu-event-val', ws.lastEvent || 'Streaming');
    setTxt('#bipu-btn-count-val', `${ws.buttonPressCount ?? 0} presses`);
    setTxt(
      '#bipu-hr-mode-val',
      ws.autonomousConfigActive
        ? `AUTONOMOUS CONTINUOUS 0x2A37 + ALL-DAY STRESS${ws.lastHealthSync ? ' · SYNC ' + ws.lastHealthSync : ''}`
        : ws.hrStreamMode === 'direct_gatt'
          ? 'DIRECT 0x2A37 OPTICAL GATT STREAM'
          : 'LOCKED · needs Huami auth key or Zepp HR sharing'
    );

    const pktPre = this.container.querySelector('#bipu-packet-log');
    if (pktPre && Array.isArray(ws.recentPackets)) {
      const lines = ws.recentPackets
        .slice(0, 12)
        .map((p) => `[${p.ts}] ${p.dir.padEnd(6)} ${p.char.padEnd(6)} | ${p.hex.slice(0, 28).padEnd(28)} | ${p.decoded || ''}`)
        .join('\n');
      if (pktPre.textContent !== lines) {
        pktPre.textContent = lines || '// Waiting for BLE GATT packets from Amazfit Bip U...';
      }
    }
  }

  updateLiveBandDom() {
    if (this.activeTab !== 'band') return;

    const statusChip = this.container.querySelector('#band-status-chip');
    const contactBadge = this.container.querySelector('#band-contact-badge');
    const hrVal = this.container.querySelector('#band-hr-val');
    const spo2Val = this.container.querySelector('#band-spo2-val');
    const rrVal = this.container.querySelector('#band-rr-val');
    const hrvVal = this.container.querySelector('#band-hrv-val');
    const pnn50Val = this.container.querySelector('#band-pnn50-val');
    const tempVal = this.container.querySelector('#band-temp-val');
    const battVal = this.container.querySelector('#band-batt-val');
    const rawVal = this.container.querySelector('#band-raw-val');

    const isConnected = this.serial.isConnected || this.ble.isConnected;
    const data = this.latestBandData;

    if (statusChip) {
      if (isConnected) {
        const sourceName = this.serial.isConnected ? 'USB Serial (115200 baud)' : (this.ble.device?.name || 'BLE GATT');
        statusChip.className = 'status-chip-live connected';
        statusChip.innerHTML = `<i class="fa-solid fa-link"></i> CONNECTED · ${sourceName}`;
      } else {
        statusChip.className = 'status-chip-live standby';
        statusChip.innerHTML = `<i class="fa-solid fa-satellite-dish"></i> STANDBY · DISCONNECTED`;
      }
    }

    if (contactBadge) {
      if (!isConnected) {
        contactBadge.className = 'contact-badge idle';
        contactBadge.innerHTML = `<i class="fa-solid fa-circle-pause"></i> HARDWARE IDLE · READY TO CONNECT`;
      } else if (data && data.finger) {
        contactBadge.className = 'contact-badge active';
        contactBadge.innerHTML = `<i class="fa-solid fa-heart-pulse"></i> SKIN CONTACT DETECTED · PERFUSION ACTIVE`;
      } else {
        contactBadge.className = 'contact-badge idle';
        contactBadge.innerHTML = `<i class="fa-solid fa-hand"></i> SENSOR OFF-WRIST · PLACE ON SKIN`;
      }
    }

    if (data && isConnected) {
      if (hrVal) hrVal.textContent = (data.finger && data.hr > 0) ? `${Math.round(data.hr)} BPM` : '--';
      if (spo2Val) spo2Val.textContent = (data.finger && data.spo2 > 0) ? `${data.spo2.toFixed(1)} %` : '--';
      if (rrVal) rrVal.textContent = (data.finger && data.rr > 0) ? `${data.rr.toFixed(1)} BrPM` : '--';
      if (hrvVal) hrvVal.textContent = (data.finger && data.hrv > 0) ? `${data.hrv} ms` : '--';
      if (pnn50Val) pnn50Val.textContent = (data.finger && data.pnn50 !== undefined) ? `${data.pnn50.toFixed(1)} %` : '--';
      if (tempVal) tempVal.textContent = data.temp ? `${data.temp.toFixed(1)} °C` : '--';
      if (battVal) battVal.textContent = (data.batt !== null && data.batt !== undefined) ? `${data.batt} %` : '--';
      if (rawVal) {
        rawVal.textContent = (data.rawIR !== null && data.rawRed !== null)
          ? `IR: ${data.rawIR} | Red: ${data.rawRed}`
          : 'PPG Raw Stream: Active';
      }
    }
  }

  render() {
    const isConnected = this.serial.isConnected || this.ble.isConnected;
    const data = this.latestBandData;
    const ws = this.ble.watchState || {};
    const bipuConnected = this.ble.isConnected && Boolean(ws.connected);

    this.container.innerHTML = `
      <div class="hardware-backdrop">
        <div class="hardware-modal">
          <div class="hardware-header">
            <div class="hardware-title-group">
              <span class="hardware-badge"><i class="fa-solid fa-microchip"></i> HARDWARE I/O</span>
              <h2>Physical Biosensor & Wearable Device Interface</h2>
            </div>
            <button class="hardware-close-btn" id="hw-close-btn" aria-label="Close dialog">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Tab Bar -->
          <div class="hw-tab-bar">
            <button class="hw-tab-btn ${this.activeTab === 'bipu' ? 'active' : ''}" data-tab="bipu">
              <i class="fa-solid fa-stopwatch"></i> Amazfit Bip U (Live Watch)
            </button>
            <button class="hw-tab-btn ${this.activeTab === 'band' ? 'active' : ''}" data-tab="band">
              <i class="fa-solid fa-ring"></i> ESP32-C3 Wristband
            </button>
            <button class="hw-tab-btn ${this.activeTab === 'serial' ? 'active' : ''}" data-tab="serial">
              <i class="fa-brands fa-usb"></i> USB Serial Monitor
            </button>
            <button class="hw-tab-btn ${this.activeTab === 'ble' ? 'active' : ''}" data-tab="ble">
              <i class="fa-brands fa-bluetooth-b"></i> Web Bluetooth (BLE)
            </button>
            <button class="hw-tab-btn ${this.activeTab === 'rppg' ? 'active' : ''}" data-tab="rppg">
              <i class="fa-solid fa-camera"></i> Optical Camera (rPPG)
            </button>
          </div>

          <div class="hw-tab-content">
            <!-- TAB 0: AMAZFIT BIP U LIVE WATCH TELEMETRY & COMMAND DECK -->
            <div class="hw-tab-pane ${this.activeTab === 'bipu' ? 'active' : ''}" id="pane-bipu">
              <div class="band-banner">
                <div class="band-banner-info">
                  <h3><i class="fa-solid fa-stopwatch"></i> Amazfit Bip U · Full Huami GATT Telemetry & Bidirectional Control</h3>
                  <p>
                    Connected directly to your physical <strong>Amazfit Bip U</strong> (Serial <code>${ws.serialNumber || '--'}</code> · Firmware <code>${ws.firmwareRevision || '--'}</code>). Pulls real-time battery & charging diagnostics (<code>0x0006</code>), steps/distance/calories (<code>0x0007</code>), watch RTC clock (<code>0x2A2B</code>), hardware button & wear events (<code>0x0010</code>), optical pulse (<code>0x2A37</code>), and pushes mission alerts straight to the watch OLED screen (<code>0x2A46</code>).
                  </p>
                </div>
                <div class="band-banner-actions">
                  ${!bipuConnected ? `
                    <button class="hw-connect-btn" id="btn-bipu-connect-bridge">
                      <i class="fa-solid fa-bolt"></i> Auto-Link Watch (Bridge)
                    </button>
                  ` : `
                    <button class="hw-disconnect-btn" id="btn-bipu-disconnect">
                      <i class="fa-solid fa-link-slash"></i> Disconnect Watch
                    </button>
                  `}
                  <button class="band-dl-btn secondary" id="btn-bipu-connect-webble">
                    <i class="fa-brands fa-bluetooth-b"></i> Pair via Web Bluetooth
                  </button>
                </div>
              </div>

              <!-- Live Status & Biometric Grid -->
              <div class="band-live-bar">
                <div class="band-live-header">
                  <span class="status-chip-live ${bipuConnected ? 'connected' : 'standby'}" id="bipu-status-chip">
                    <i class="fa-solid ${bipuConnected ? 'fa-link' : 'fa-satellite-dish'}"></i>
                    ${bipuConnected ? `LINKED · ${ws.deviceName || 'Amazfit Bip U'} (${ws.connectionMode || 'BLE'})` : 'STANDBY · SEARCHING FOR AMAZFIT BIP U'}
                  </span>
                  <span class="contact-badge ${(bipuConnected && ws.wearing === true) ? 'active' : 'idle'}" id="bipu-wear-badge">
                    <i class="fa-solid ${(bipuConnected && ws.wearing === true) ? 'fa-heart-pulse' : 'fa-hand'}"></i>
                    ${!bipuConnected ? 'WATCH DISCONNECTED' : (ws.wearing === true ? 'ON-WRIST' : (ws.wearing === false ? 'OFF-WRIST DETECTED' : 'WEAR STATE UNKNOWN'))}
                  </span>
                </div>

                <div class="band-live-grid">
                  <div class="band-live-metric">
                    <span class="m-lbl">Heart Rate</span>
                    <span class="m-val" id="bipu-hr-val">${ws.hr > 0 ? Math.round(ws.hr) + ' BPM' : '--'}</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">SpO2 Blood Oxygen</span>
                    <span class="m-val" id="bipu-spo2-val">${ws.spo2 > 0 ? `${ws.spo2}%${ws.spo2Mode ? ' · ' + ws.spo2Mode : ''}` : 'Awaiting watch scan'}</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">HRV (SDNN)</span>
                    <span class="m-val" id="bipu-hrv-val">${ws.hrv ? ws.hrv + ' ms' : '--'}</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">Stress Level (Auto)</span>
                    <span class="m-val" id="bipu-stress-val">${ws.stress > 0 ? `${ws.stress}/100${ws.stressMode ? ' · ' + ws.stressMode : ''}` : 'Auto-monitoring (5m)'}</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">PAI & Stand Hours</span>
                    <span class="m-val" id="bipu-pai-val">${ws.paiTotal !== null && ws.paiTotal !== undefined ? `${ws.paiTotal} PAI${ws.standHours != null ? ' · ' + ws.standHours + 'h' : ''}` : '--'}</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">Steps (0x0007)</span>
                    <span class="m-val" id="bipu-steps-val">${ws.steps ?? '--'}</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">Distance (0x0007)</span>
                    <span class="m-val" id="bipu-dist-val">${ws.distanceMeters ?? '--'} m</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">Active Calories</span>
                    <span class="m-val" id="bipu-cal-val">${ws.caloriesKcal ?? '--'} kcal</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">Step Cadence</span>
                    <span class="m-val" id="bipu-cadence-val">${ws.cadenceSpm ?? '--'} spm</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">Battery (0x0006)</span>
                    <span class="m-val" id="bipu-batt-val">${ws.batt !== null && ws.batt !== undefined ? `${ws.batt}% ${ws.charging ? '⚡ CHARGING' : '· ON BATT'}` : '--'}</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">Watch RTC (0x2A2B)</span>
                    <span class="m-val small" id="bipu-clock-val">${ws.watchTime || '--'}</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">Last Full Charge</span>
                    <span class="m-val small" id="bipu-last-charge-val">${ws.lastChargeTime ? `${ws.lastChargeTime} (${ws.lastChargeLevel}%)` : '--'}</span>
                  </div>
                </div>
              </div>

              <!-- Watch Hardware Identity & GATT Dossier -->
              <div class="band-section-title">
                <i class="fa-solid fa-fingerprint"></i> Extracted Hardware Identity & GATT Dossier 
              </div>
              <div class="band-schematic-wrap" style="margin-bottom: 14px;">
                <table class="band-schematic-table">
                  <thead>
                    <tr>
                      <th>GATT Property</th>
                      <th>UUID / Handle</th>
                      <th>Live Value Extracted from Watch</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Serial & PnP ID</strong></td>
                      <td><code>0x2A25 / 0x2A50</code></td>
                      <td><code id="bipu-serial-val">${ws.serialNumber || '--'}</code> · Vendor <code>0x0157 (Huami)</code> · Product <code>0x0047 (Bip U)</code></td>
                    </tr>
                    <tr>
                      <td><strong>Firmware & HW Rev</strong></td>
                      <td><code>0x2A28 / 0x2A27</code></td>
                      <td id="bipu-fw-val">${ws.firmwareRevision || '--'} / HW ${ws.hardwareRevision || '--'}</td>
                    </tr>
                    <tr>
                      <td><strong>System MAC & MTU</strong></td>
                      <td><code>0x2A23 / 0x0010</code></td>
                      <td id="bipu-mac-val">${ws.address || '--'} · MTU ${ws.mtu || '--'}B</td>
                    </tr>
                    <tr>
                      <td><strong>Latest Watch Event</strong></td>
                      <td><code>0x0010 / 0x000F</code></td>
                      <td><span id="bipu-event-val">${ws.lastEvent || 'Connected'}</span> (<span id="bipu-btn-count-val">${ws.buttonPressCount ?? 0} presses</span>)</td>
                    </tr>
                    <tr>
                      <td><strong>Biometric Pipeline</strong></td>
                      <td><code>0x2A37 / 0xFEE0</code></td>
                      <td><code id="bipu-hr-mode-val">${ws.hrStreamMode === 'direct_gatt' ? 'DIRECT 0x2A37 OPTICAL GATT STREAM' : 'LOCKED · needs Huami auth key or Zepp HR sharing'}</code></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Bidirectional Watch OLED Alert & Haptic Controls -->
              <div class="band-section-title">
                <i class="fa-solid fa-satellite-dish"></i> Bidirectional Watch Control · OLED Screen Alert & Haptics
              </div>
              <div class="hw-pane-desc" style="margin-bottom: 12px;">
                <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 10px;">
                  <input
                    type="text"
                    id="bipu-alert-input"
                    class="hw-select"
                    style="flex: 1; min-width: 240px;"
                    placeholder="Type message to display on Amazfit Bip U screen..."
                    value="AURA-OS: TELEMETRY NOMINAL"
                  />
                  <button class="hw-connect-btn" id="btn-bipu-send-alert">
                    <i class="fa-solid fa-paper-plane"></i> Push to Watch OLED (0x2A46)
                  </button>
                  <button class="band-dl-btn secondary" id="btn-bipu-vibrate">
                    <i class="fa-solid fa-bell"></i> Vibrate Watch (0x2A06)
                  </button>
                  <button class="band-dl-btn secondary" id="btn-bipu-sync-clock">
                    <i class="fa-solid fa-clock"></i> Sync RTC Clock (0x2A2B)
                  </button>
                  <button class="band-dl-btn secondary" id="btn-bipu-ping-hr">
                    <i class="fa-solid fa-heart-pulse"></i> Trigger HR (0x2A39)
                  </button>
                  <button class="band-dl-btn secondary" id="btn-bipu-sync-health">
                    <i class="fa-solid fa-rotate"></i> Sync SpO2 / Stress (0x0004)
                  </button>
                </div>
                <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
                  <span style="font-size: 0.75rem; opacity: 0.75;">Quick Mission Presets:</span>
                  <button class="band-dl-btn secondary bipu-preset-btn" data-msg="AURA-OS: LBNP SUCTION PROTOCOL START">LBNP Protocol</button>
                  <button class="band-dl-btn secondary bipu-preset-btn" data-msg="ALERT: CABIN ppCO2 ELEVATED (4.2 mmHg)">CO2 Alert</button>
                  <button class="band-dl-btn secondary bipu-preset-btn" data-msg="SPE RADIATION STORM: ENTER HAVEN">Radiation Storm</button>
                  <span id="bipu-action-status" style="margin-left: auto; font-size: 0.78rem; color: var(--accent-cyan, #38bdf8);">${this.bipuActionFeedback}</span>
                </div>
              </div>

              <!-- Optional Direct 0x2A37 Unlock via Huami Auth Key or Zepp Cloud -->
              <div class="band-section-title">
                <i class="fa-solid fa-key"></i> Direct 0x2A37 Optical HR Unlock (Zepp HR Sharing / Huami AES-128 Key)
              </div>
              <div class="hw-pane-desc" style="margin-bottom: 12px;">
                <div style="font-size: 0.8rem; margin-bottom: 8px; opacity: 0.9;">
                  To unlock raw <code>0x2A37</code> notifications directly from the watch firmware, either toggle <strong>Activity Heart Rate Sharing</strong> On inside the Zepp app (<em>Profile → Amazfit Bip U → Activity Heart Rate Sharing</em>), paste your 32-hex Huami Auth Key below, or fetch it directly from your Zepp email account:
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 8px;">
                  <input
                    type="text"
                    id="bipu-auth-key-input"
                    class="hw-select"
                    style="flex: 1; min-width: 240px; font-family: var(--font-mono);"
                    placeholder="32-char hex Auth Key (e.g. 30313233343536373839404142434445)"
                  />
                  <button class="band-dl-btn" id="btn-bipu-apply-key">
                    <i class="fa-solid fa-unlock-keyhole"></i> Authenticate Watch (0x0009 AES-128)
                  </button>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                  <input
                    type="email"
                    id="bipu-zepp-email"
                    class="hw-select"
                    style="flex: 1; min-width: 170px;"
                    placeholder="Zepp Account Email"
                  />
                  <input
                    type="password"
                    id="bipu-zepp-pass"
                    class="hw-select"
                    style="flex: 1; min-width: 150px;"
                    placeholder="Zepp Password"
                  />
                  <button class="band-dl-btn secondary" id="btn-bipu-fetch-zepp">
                    <i class="fa-solid fa-cloud-arrow-down"></i> Pull Key from Zepp Cloud
                  </button>
                </div>
              </div>

              <!-- Custom AURA-OS Health Watchface (Amazfit Bip U 302x320) -->
              <div class="band-section-title">
                <i class="fa-solid fa-palette"></i> Custom AURA-OS Health Watchface · All Biosensors & Metrics
              </div>
              <div class="hw-pane-desc" style="margin-bottom: 14px; background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: 8px; border: 1px solid rgba(56, 189, 248, 0.2);">
                <div style="display: flex; gap: 18px; flex-wrap: wrap; align-items: center;">
                  <div style="flex: 0 0 auto; text-align: center;">
                    <img
                      src="/aura_watch_framed.png"
                      alt="AURA-OS Health Watchface Preview"
                      style="width: 170px; height: auto; border-radius: 14px; box-shadow: 0 8px 24px rgba(0, 229, 255, 0.25); border: 1px solid rgba(0, 229, 255, 0.3);"
                    />
                    <div style="font-size: 0.72rem; color: #38bdf8; margin-top: 6px; font-weight: 600;">Amazfit Bip U (302×320)</div>
                  </div>
                  <div style="flex: 1; min-width: 260px;">
                    <h4 style="margin: 0 0 6px 0; font-size: 1rem; color: #f8fafc; display: flex; align-items: center; gap: 8px;">
                      <span>AURA-OS Aerospace Health Face</span>
                      <span style="font-size: 0.65rem; background: rgba(0, 229, 255, 0.15); color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 2px 6px; border-radius: 4px;">Compiled .BIN</span>
                    </h4>
                    <p style="margin: 0 0 10px 0; font-size: 0.8rem; color: #94a3b8; line-height: 1.4;">
                      Tailored specifically for the <strong>Amazfit Bip U / Bip U Pro</strong> (RTOS display controller). Renders all physical biosensors and movement telemetry directly on your wrist with high-contrast, aerospace-grade HUD gauges:
                    </p>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 6px; margin-bottom: 12px; font-size: 0.75rem;">
                      <div style="display: flex; align-items: center; gap: 6px; color: #ff2d55;">
                        <i class="fa-solid fa-heart-pulse"></i> <span>Real-Time Pulse (BPM)</span>
                      </div>
                      <div style="display: flex; align-items: center; gap: 6px; color: #ff758c;">
                        <i class="fa-solid fa-gauge-high"></i> <span>6-Zone Heart Bar</span>
                      </div>
                      <div style="display: flex; align-items: center; gap: 6px; color: #00e5ff;">
                        <i class="fa-solid fa-shoe-prints"></i> <span>Step Counter + Goal Bar</span>
                      </div>
                      <div style="display: flex; align-items: center; gap: 6px; color: #ff9500;">
                        <i class="fa-solid fa-fire"></i> <span>Active Calories (kcal)</span>
                      </div>
                      <div style="display: flex; align-items: center; gap: 6px; color: #30d158;">
                        <i class="fa-solid fa-route"></i> <span>Distance Walked (km)</span>
                      </div>
                      <div style="display: flex; align-items: center; gap: 6px; color: #bf5af2;">
                        <i class="fa-solid fa-bolt"></i> <span>PAI Activity Score</span>
                      </div>
                      <div style="display: flex; align-items: center; gap: 6px; color: #38bdf8;">
                        <i class="fa-solid fa-clock"></i> <span>24h Clock (HH:MM:SS)</span>
                      </div>
                      <div style="display: flex; align-items: center; gap: 6px; color: #30d158;">
                        <i class="fa-solid fa-battery-three-quarters"></i> <span>Battery % & Dynamic Icon</span>
                      </div>
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                      <a
                        href="/aura_os_health.bin"
                        download="aura_os_health.bin"
                        class="hw-connect-btn"
                        style="text-decoration: none; display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px;"
                      >
                        <i class="fa-solid fa-download"></i> Download Watchface (aura_os_health.bin · 415 KB)
                      </a>
                      <a
                        href="/aura_os_health_preview.png"
                        target="_blank"
                        class="band-dl-btn secondary"
                        style="text-decoration: none; display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px;"
                      >
                        <i class="fa-solid fa-image"></i> High-Res 1:1 Preview
                      </a>
                      <button
                        class="band-dl-btn secondary"
                        id="btn-bipu-release-ble"
                        style="display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-color: rgba(239, 68, 68, 0.4); color: #f87171;"
                        title="Disconnects Mac so Gadgetbridge on phone can pair & flash"
                      >
                        <i class="fa-solid fa-link-slash"></i> Release Watch for Phone Flashing
                      </button>
                      <button
                        class="band-dl-btn secondary"
                        id="btn-bipu-resume-ble"
                        style="display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-color: rgba(48, 209, 88, 0.4); color: #34d399;"
                        title="Reconnects Mac to watch after flashing is done"
                      >
                        <i class="fa-solid fa-rotate"></i> Resume AURA-OS Bridge
                      </button>
                    </div>
                  </div>
                  <!-- Phone QR Code for 1-Tap Download -->
                  <div style="flex: 0 0 auto; text-align: center; background: rgba(0, 0, 0, 0.4); padding: 8px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);">
                    <img
                      src="/aura_qr_download.png"
                      alt="Scan to Download Watchface"
                      style="width: 104px; height: 104px; display: block; border-radius: 4px; background: #fff;"
                    />
                    <div style="font-size: 0.68rem; color: #94a3b8; margin-top: 4px;">Scan with Camera<br><strong style="color: #38bdf8;">to download .bin</strong></div>
                  </div>
                </div>
                <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.08); font-size: 0.76rem; color: #cbd5e1; display: flex; flex-direction: column; gap: 4px;">
                  <span style="font-weight: 600; color: #38bdf8;"><i class="fa-solid fa-circle-info"></i> How to flash to your Amazfit Bip U:</span>
                  <div><strong>• Gadgetbridge (Android):</strong> Download <code>aura_os_health.bin</code> to your phone → Tap file in file manager → Select <em>"Gadgetbridge FW/App installer"</em> → Click <strong>Install</strong>.</div>
                  <div><strong>• Notify for Amazfit & Zepp (Android/iOS):</strong> Open app → Watchfaces → Custom / Local Watchface → Pick <code>aura_os_health.bin</code> → Tap <strong>Start Update</strong>.</div>
                  <div><strong>• Zepp App (Local File Override):</strong> Download any default watchface in Zepp to cache it, swap the cached <code>.bin</code> in <code>Android/data/com.huami.watch.hmwatchmanager/files/watch_skin_local/</code> with <code>aura_os_health.bin</code>, and tap Sync Watch Face.</div>
                </div>
              </div>

              <!-- Live BLE GATT Packet Sniffer -->
              <div class="serial-terminal-wrap">
                <div class="terminal-header">
                  <span><i class="fa-solid fa-wave-square"></i> LIVE HUAMI BLE GATT PACKET INSPECTOR (0xFEE0 / 0xFEE1 / 0x180F / 0x180D)</span>
                  <span class="term-status">${bipuConnected ? 'RECEIVING GATT FRAMES' : 'IDLE'}</span>
                </div>
                <pre class="terminal-output" id="bipu-packet-log">${
                  (ws.recentPackets && ws.recentPackets.length > 0)
                    ? ws.recentPackets.slice(0, 12).map((p) => `[${p.ts}] ${p.dir.padEnd(6)} ${p.char.padEnd(6)} | ${p.hex.slice(0, 28).padEnd(28)} | ${p.decoded || ''}`).join('\n')
                    : '// Waiting for BLE GATT packets from Amazfit Bip U...'
                }</pre>
              </div>
            </div>

            <!-- TAB 1: ESP32-C3 ASTRONAUT WRISTBAND -->
            <div class="hw-tab-pane ${this.activeTab === 'band' ? 'active' : ''}" id="pane-band">
              <div class="band-banner">
                <div class="band-banner-info">
                  <h3><i class="fa-solid fa-shield-halved"></i> AURA-OS Physical Biometric Band</h3>
                  <p>
                    Production hardware build for NASA Space Apps Challenge. Reads real-time photoplethysmography (PPG) from MAX30102, renders on 0.96" OLED, and broadcasts zero-fake-data telemetry to AURA-OS.
                  </p>
                </div>
                <div class="band-banner-actions">
                  <button class="band-dl-btn" id="btn-band-dl-ino">
                    <i class="fa-solid fa-download"></i> Download Firmware (.ino)
                  </button>
                  <button class="band-dl-btn secondary" id="btn-band-copy-ino">
                    <i class="fa-solid fa-copy"></i> <span id="copy-ino-label">Copy Sketch</span>
                  </button>
                  <button class="band-dl-btn secondary" id="btn-band-dl-guide">
                    <i class="fa-solid fa-book"></i> Wiring Guide (.md)
                  </button>
                </div>
              </div>

              <!-- Live Telemetry Status Bar -->
              <div class="band-live-bar">
                <div class="band-live-header">
                  <span class="status-chip-live ${isConnected ? 'connected' : 'standby'}" id="band-status-chip">
                    <i class="fa-solid ${isConnected ? 'fa-link' : 'fa-satellite-dish'}"></i>
                    ${isConnected ? 'CONNECTED · ' + (this.serial.isConnected ? 'USB Serial' : (this.ble.device?.name || 'BLE')) : 'STANDBY · DISCONNECTED'}
                  </span>
                  <span class="contact-badge ${(!isConnected || !data?.finger) ? 'idle' : 'active'}" id="band-contact-badge">
                    <i class="fa-solid ${(!isConnected || !data?.finger) ? 'fa-hand' : 'fa-heart-pulse'}"></i>
                    ${!isConnected ? 'HARDWARE IDLE · READY TO CONNECT' : (data?.finger ? 'SKIN CONTACT DETECTED · PERFUSION ACTIVE' : 'SENSOR OFF-WRIST · PLACE ON SKIN')}
                  </span>
                </div>

                <div class="band-live-grid">
                  <div class="band-live-metric">
                    <span class="m-lbl">Heart Rate</span>
                    <span class="m-val" id="band-hr-val">${(data?.finger && data?.hr > 0) ? Math.round(data.hr) + ' BPM' : '--'}</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">SpO2 Oxygen</span>
                    <span class="m-val" id="band-spo2-val">${(data?.finger && data?.spo2 > 0) ? data.spo2.toFixed(1) + ' %' : '--'}</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">Resp Rate (RSA)</span>
                    <span class="m-val" id="band-rr-val">${(data?.finger && data?.rr > 0) ? data.rr.toFixed(1) + ' BrPM' : '--'}</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">HRV (SDNN)</span>
                    <span class="m-val" id="band-hrv-val">${(data?.finger && data?.hrv > 0) ? data.hrv + ' ms' : '--'}</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">Stress / pNN50</span>
                    <span class="m-val" id="band-pnn50-val">${(data?.finger && data?.pnn50 !== undefined) ? data.pnn50.toFixed(1) + ' %' : '--'}</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">Skin Temp</span>
                    <span class="m-val" id="band-temp-val">${data?.temp ? data.temp.toFixed(1) + ' °C' : '--'}</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">LiPo Battery</span>
                    <span class="m-val" id="band-batt-val">${data?.batt ? data.batt + ' %' : '95 %'}</span>
                  </div>
                  <div class="band-live-metric wide">
                    <span class="m-lbl">Raw Optical Signal</span>
                    <span class="m-val small" id="band-raw-val">
                      ${(data?.rawIR !== null && data?.rawIR !== undefined) ? `IR: ${data.rawIR} | Red: ${data.rawRed}` : 'Awaiting sensor stream'}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Quick Connect Controls -->
              <div class="band-quick-connect-row">
                ${!this.serial.isConnected ? `
                  <button class="hw-connect-btn" id="btn-band-quick-serial">
                    <i class="fa-brands fa-usb"></i> Connect USB Port (115200 baud)
                  </button>
                ` : `
                  <button class="hw-disconnect-btn" id="btn-band-quick-disconnect-serial">
                    <i class="fa-solid fa-link-slash"></i> Disconnect USB Serial
                  </button>
                `}

                ${!this.ble.isConnected ? `
                  <button class="hw-connect-btn" id="btn-band-quick-ble">
                    <i class="fa-brands fa-bluetooth-b"></i> Pair AURA-BAND-C3 / Bip U (BLE)
                  </button>
                ` : `
                  <button class="hw-disconnect-btn" id="btn-band-quick-disconnect-ble">
                    <i class="fa-solid fa-link-slash"></i> Disconnect Bluetooth
                  </button>
                `}
              </div>

              <!-- Hardware Components from Shopping Cart -->
              <div class="band-section-title">
                <i class="fa-solid fa-layer-group"></i> Bill of Materials (Exact Hardware Components)
              </div>
              <div class="band-components-grid">
                <div class="band-comp-card">
                  <div class="comp-icon"><i class="fa-solid fa-microchip"></i></div>
                  <div class="comp-info">
                    <h4>ESP32-C3 RISC-V MCU</h4>
                    <p>160MHz 32-bit core, built-in USB-CDC & BLE 5.0 GATT. Runs firmware, I2C polling, and physiological algorithms.</p>
                  </div>
                </div>
                <div class="band-comp-card">
                  <div class="comp-icon"><i class="fa-solid fa-heart-pulse"></i></div>
                  <div class="comp-info">
                    <h4>MAX30102 Biosensor</h4>
                    <p>Red (660nm) & IR (880nm) optical PPG sensor. 18-bit ADC, I2C address 0x57. Detects true pulse and calculates SpO2.</p>
                  </div>
                </div>
                <div class="band-comp-card">
                  <div class="comp-icon"><i class="fa-solid fa-tv"></i></div>
                  <div class="comp-info">
                    <h4>0.96" I2C OLED Display</h4>
                    <p>128x64 monochrome SSD1306 screen at address 0x3C. Displays on-wrist pulse, SpO2, HRV, battery, and contact alerts.</p>
                  </div>
                </div>
                <div class="band-comp-card">
                  <div class="comp-icon"><i class="fa-solid fa-bolt"></i></div>
                  <div class="comp-info">
                    <h4>BMS 1S TP4056 Module</h4>
                    <p>5V 1A CC/CV LiPo charger with over-charge, over-discharge (2.5V), and short-circuit protection for wearable safety.</p>
                  </div>
                </div>
                <div class="band-comp-card">
                  <div class="comp-icon"><i class="fa-solid fa-car-battery"></i></div>
                  <div class="comp-info">
                    <h4>3.7V LiPo Battery Cell</h4>
                    <p>1S 3.7V nominal (4.2V max) battery. Lightweight profile designed for comfortable astronaut wristband enclosure.</p>
                  </div>
                </div>
                <div class="band-comp-card">
                  <div class="comp-icon"><i class="fa-brands fa-usb"></i></div>
                  <div class="comp-info">
                    <h4>Type-C Female Connector</h4>
                    <p>Standard USB-C pigtail connector. Provides 5V input charging to TP4056 and secure power delivery.</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- TAB 2: USB SERIAL -->
            <div class="hw-tab-pane ${this.activeTab === 'serial' ? 'active' : ''}" id="pane-serial">
              <div class="hw-pane-desc">
                Stream raw telemetry directly from USB microcontrollers (ESP32-C3, Arduino, STM32) at 115200 baud. Ingests structured JSON payload: <code>{"hr":72,"spo2":98.4,"temp":36.8,"hrv":56,"batt":94,"finger":true}</code>.
              </div>

              <div class="serial-config-row">
                <label for="serial-baud">Baud Rate:</label>
                <select id="serial-baud" class="hw-select">
                  <option value="115200" selected>115200 baud (ESP32-C3 Default)</option>
                  <option value="9600">9600 baud</option>
                  <option value="57600">57600 baud</option>
                </select>

                ${!this.serial.isConnected ? `
                  <button class="hw-connect-btn" id="btn-serial-connect">
                    <i class="fa-brands fa-usb"></i> Connect USB Port
                  </button>
                ` : `
                  <button class="hw-disconnect-btn" id="btn-serial-disconnect">
                    <i class="fa-solid fa-link-slash"></i> Close Serial Port
                  </button>
                `}

                <button class="hw-secondary-btn" id="btn-download-firmware">
                  <i class="fa-solid fa-file-code"></i> Download ESP32-C3 Sketch (.ino)
                </button>
              </div>

              <!-- Live Serial Terminal Monitor -->
              <div class="serial-terminal-wrap">
                <div class="terminal-header">
                  <span><i class="fa-solid fa-terminal"></i> LIVE SERIAL STREAM (115200 BAUD)</span>
                  <span class="term-status">${this.serial.isConnected ? 'READING DATA' : 'PORT IDLE'}</span>
                </div>
                <pre class="terminal-output" id="serial-terminal-output">${this.serialLogs.slice(-10).join('\n') || '// Connect ESP32-C3 to view incoming serial JSON telemetry...'}</pre>
              </div>
            </div>

            <!-- TAB 3: WEB BLUETOOTH (BLE) -->
            <div class="hw-tab-pane ${this.activeTab === 'ble' ? 'active' : ''}" id="pane-ble">
              <div class="hw-pane-desc">
                Connect directly to Bluetooth Low Energy (BLE) wearables including <strong>Amazfit Bip U</strong> (<code>0xFEE0</code> / <code>0x180D</code>), custom <strong>AURA-BAND-C3</strong>, and standard medical heart rate sensors.
              </div>

              <div class="hw-status-box" id="ble-status-box">
                <div class="hw-status-indicator ${this.ble.isConnected ? 'connected' : 'disconnected'}">
                  <i class="fa-solid fa-circle"></i>
                  <span>${this.ble.isConnected ? 'DEVICE CONNECTED' : 'READY TO SCAN'}</span>
                </div>
                <div class="hw-device-name" id="ble-device-name">
                  ${this.ble.device?.name || 'No BLE hardware paired'}
                </div>
              </div>

              <div class="hw-action-row">
                ${!this.ble.isConnected ? `
                  <button class="hw-connect-btn" id="btn-ble-connect">
                    <i class="fa-brands fa-bluetooth-b"></i> Link Amazfit Bip U / BLE Sensor
                  </button>
                ` : `
                  <button class="hw-disconnect-btn" id="btn-ble-disconnect">
                    <i class="fa-solid fa-link-slash"></i> Disconnect Bluetooth Sensor
                  </button>
                `}
              </div>
            </div>

            <!-- TAB 4: OPTICAL CAMERA (rPPG) -->
            <div class="hw-tab-pane ${this.activeTab === 'rppg' ? 'active' : ''}" id="pane-rppg">
              <div class="hw-pane-desc">
                Contactless / Fingertip Remote Photoplethysmography (rPPG). Measures microscopic fluctuations in optical hemoglobin green-light absorption via your camera to calculate real pulse and heart rate variability (HRV) with zero external hardware.
              </div>

              <div class="rppg-interface-layout">
                <div class="rppg-video-wrap">
                  <video id="rppg-video-preview" autoplay playsinline muted></video>
                  <div class="rppg-aim-guide">
                    <div class="aim-reticle"></div>
                    <span>Position face or fingertip over lens</span>
                  </div>
                </div>

                <div class="rppg-stats-side">
                  <div class="rppg-pulse-stat">
                    <span class="label">OPTICAL PULSE</span>
                    <span class="bpm-num" id="rppg-bpm-readout">${this.rppg.isRunning ? this.rppg.calculatedBpm : '--'}</span>
                    <span class="unit">BPM</span>
                  </div>

                  <div class="rppg-controls-row">
                    ${!this.rppg.isRunning ? `
                      <button class="hw-connect-btn" id="btn-rppg-start">
                        <i class="fa-solid fa-camera"></i> Activate Camera Sensor
                      </button>
                    ` : `
                      <button class="hw-disconnect-btn" id="btn-rppg-stop">
                        <i class="fa-solid fa-power-off"></i> Stop Optical Sensor
                      </button>
                    `}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="hardware-footer">
            <span class="hw-footer-note">
              <i class="fa-solid fa-shield-halved"></i> 100% Real Biosensor Telemetry · Amazfit Bip U + ESP32-C3 + rPPG Ingestion Active
            </span>
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  setBipuFeedback(msg) {
    this.bipuActionFeedback = msg;
    const el = this.container.querySelector('#bipu-action-status');
    if (el) el.textContent = msg;
  }

  attachEvents() {
    const closeBtn = this.container.querySelector('#hw-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    // Tab switcher
    this.container.querySelectorAll('.hw-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        sound.playClick();
        this.activeTab = btn.dataset.tab;
        this.render();
      });
    });

    // --- Amazfit Bip U Tab Actions ---
    const bipuConnectBridge = this.container.querySelector('#btn-bipu-connect-bridge');
    const bipuConnectWebBle = this.container.querySelector('#btn-bipu-connect-webble');
    const bipuDisconnect = this.container.querySelector('#btn-bipu-disconnect');
    const bipuSendAlert = this.container.querySelector('#btn-bipu-send-alert');
    const bipuVibrate = this.container.querySelector('#btn-bipu-vibrate');
    const bipuSyncClock = this.container.querySelector('#btn-bipu-sync-clock');
    const bipuPingHr = this.container.querySelector('#btn-bipu-ping-hr');
    const bipuSyncHealth = this.container.querySelector('#btn-bipu-sync-health');
    const bipuApplyKey = this.container.querySelector('#btn-bipu-apply-key');
    const bipuFetchZepp = this.container.querySelector('#btn-bipu-fetch-zepp');
    const bipuReleaseBle = this.container.querySelector('#btn-bipu-release-ble');
    const bipuResumeBle = this.container.querySelector('#btn-bipu-resume-ble');

    if (bipuConnectBridge) {
      bipuConnectBridge.addEventListener('click', async () => {
        try {
          sound.playClick();
          this.setBipuFeedback('Linking to Amazfit Bip U...');
          const name = await this.ble.connect(false);
          sound.playSuccess();
          this.setBipuFeedback(`Linked to ${name}`);
          if (this.onSourceChanged) this.onSourceChanged(`${name} (BLE)`);
          this.render();
        } catch (err) {
          this.setBipuFeedback(err.message || 'Connection failed');
        }
      });
    }

    if (bipuConnectWebBle) {
      bipuConnectWebBle.addEventListener('click', async () => {
        try {
          sound.playClick();
          const name = await this.ble.connectWebBluetooth();
          sound.playSuccess();
          this.setBipuFeedback(`Paired via Web Bluetooth: ${name}`);
          if (this.onSourceChanged) this.onSourceChanged(`${name} (BLE)`);
          this.render();
        } catch (err) {
          this.setBipuFeedback(err.message || 'Web Bluetooth cancelled');
        }
      });
    }

    if (bipuDisconnect) {
      bipuDisconnect.addEventListener('click', () => {
        sound.playClick();
        this.ble.disconnect();
        if (this.onSourceChanged) this.onSourceChanged('Simulated Flight Baseline');
        this.render();
      });
    }

    if (bipuSendAlert) {
      bipuSendAlert.addEventListener('click', async () => {
        try {
          sound.playClick();
          const inp = this.container.querySelector('#bipu-alert-input');
          const msg = inp ? inp.value.trim() : 'AURA-OS ALERT';
          this.setBipuFeedback('Pushing alert to watch OLED (0x2A46)...');
          await this.ble.sendWatchAlert(msg);
          sound.playSuccess();
          this.setBipuFeedback(`Displayed on watch: "${msg}"`);
        } catch (err) {
          this.setBipuFeedback(`Alert error: ${err.message}`);
        }
      });
    }

    this.container.querySelectorAll('.bipu-preset-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const msg = btn.dataset.msg;
        const inp = this.container.querySelector('#bipu-alert-input');
        if (inp) inp.value = msg;
        try {
          sound.playClick();
          await this.ble.sendWatchAlert(msg);
          sound.playSuccess();
          this.setBipuFeedback(`Displayed on watch: "${msg}"`);
        } catch (err) {
          this.setBipuFeedback(`Alert error: ${err.message}`);
        }
      });
    });

    if (bipuVibrate) {
      bipuVibrate.addEventListener('click', async () => {
        try {
          sound.playClick();
          this.setBipuFeedback('Triggering watch vibration (0x2A06)...');
          await this.ble.vibrateWatch(2, 600);
          sound.playSuccess();
          this.setBipuFeedback('Watch haptic pulse triggered!');
        } catch (err) {
          this.setBipuFeedback(`Vibrate error: ${err.message}`);
        }
      });
    }

    if (bipuSyncClock) {
      bipuSyncClock.addEventListener('click', async () => {
        try {
          sound.playClick();
          this.setBipuFeedback('Syncing watch RTC clock (0x2A2B)...');
          const res = await this.ble.syncWatchTime();
          sound.playSuccess();
          this.setBipuFeedback(`Watch RTC read: ${res.watchTime || 'Synced'}`);
        } catch (err) {
          this.setBipuFeedback(`Clock sync error: ${err.message}`);
        }
      });
    }

    if (bipuPingHr) {
      bipuPingHr.addEventListener('click', async () => {
        try {
          sound.playClick();
          this.setBipuFeedback('Probing 0x2A37 / 0x2A39 optical HR...');
          const res = await this.ble.triggerHrScan();
          if (res.ok) {
            sound.playSuccess();
            this.setBipuFeedback('Direct 0x2A37 Optical HR stream active!');
          } else {
            this.setBipuFeedback('Heart rate is locked by the watch. Authenticate with your Huami auth key below (no live HR until then).');
          }
        } catch (err) {
          this.setBipuFeedback(err.message);
        }
      });
    }

    if (bipuSyncHealth) {
      bipuSyncHealth.addEventListener('click', async () => {
        try {
          sound.playClick();
          this.setBipuFeedback('Syncing SpO2, Stress, PAI & Activity records over 0x0004/0x0005...');
          const res = await this.ble.syncWatchHealth(true);
          if (res.ok) {
            sound.playSuccess();
            this.setBipuFeedback(
              `Synced! SpO2: ${res.spo2 ?? '--'}% · Stress: ${res.stress ?? '--'} · PAI: ${res.paiTotal ?? '--'}`
            );
          } else {
            this.setBipuFeedback(res.reason || res.error || 'Health sync failed');
          }
        } catch (err) {
          this.setBipuFeedback(`Sync error: ${err.message}`);
        }
      });
    }

    if (bipuApplyKey) {
      bipuApplyKey.addEventListener('click', async () => {
        try {
          sound.playClick();
          const inp = this.container.querySelector('#bipu-auth-key-input');
          const keyHex = inp ? inp.value.trim() : '';
          if (!keyHex) {
            this.setBipuFeedback('Enter a 32-hex character Huami Auth Key first.');
            return;
          }
          this.setBipuFeedback('Running AES-128-ECB challenge-response on 0x0009...');
          const res = await this.ble.authenticateWithKey(keyHex);
          if (res.ok && res.authenticated) {
            sound.playSuccess();
            this.setBipuFeedback('AES-128 Auth Succeeded! Direct 0x2A37 Optical HR unlocked!');
          } else {
            this.setBipuFeedback(res.error || 'Watch rejected key (verify 32-hex token from your Zepp account).');
          }
        } catch (err) {
          this.setBipuFeedback(`Auth error: ${err.message}`);
        }
      });
    }

    if (bipuFetchZepp) {
      bipuFetchZepp.addEventListener('click', async () => {
        try {
          sound.playClick();
          const email = this.container.querySelector('#bipu-zepp-email')?.value.trim() || '';
          const pass = this.container.querySelector('#bipu-zepp-pass')?.value || '';
          if (!email || !pass) {
            this.setBipuFeedback('Enter your Zepp email and password first.');
            return;
          }
          this.setBipuFeedback('Querying Zepp cloud for your watch Bluetooth Auth Key...');
          const res = await this.ble.fetchZeppKey(email, pass);
          if (res.ok && res.authKey) {
            sound.playSuccess();
            const keyInp = this.container.querySelector('#bipu-auth-key-input');
            if (keyInp) keyInp.value = res.authKey;
            this.setBipuFeedback(`Fetched key ${res.authKey.slice(0, 8)}... & authenticated=${res.authenticated}!`);
          } else {
            this.setBipuFeedback(res.error || 'Could not fetch key from Zepp cloud.');
          }
        } catch (err) {
          this.setBipuFeedback(`Zepp login error: ${err.message}`);
        }
      });
    }

    if (bipuReleaseBle) {
      bipuReleaseBle.addEventListener('click', async () => {
        try {
          sound.playClick();
          this.setBipuFeedback('Releasing watch BLE link for phone/Gadgetbridge flashing...');
          await this.ble.releaseBle();
          sound.playSuccess();
          this.setBipuFeedback('Watch BLE released! Connect with Gadgetbridge on your phone now.');
        } catch (err) {
          this.setBipuFeedback(`Release error: ${err.message}`);
        }
      });
    }

    if (bipuResumeBle) {
      bipuResumeBle.addEventListener('click', async () => {
        try {
          sound.playClick();
          this.setBipuFeedback('Resuming AURA-OS bridge connection...');
          await this.ble.resumeBle();
          sound.playSuccess();
          this.setBipuFeedback('AURA-OS bridge resumed! Reconnecting to Amazfit Bip U...');
        } catch (err) {
          this.setBipuFeedback(`Resume error: ${err.message}`);
        }
      });
    }

    // --- Band Tab Actions ---
    const bandDlIno = this.container.querySelector('#btn-band-dl-ino');
    const bandCopyIno = this.container.querySelector('#btn-band-copy-ino');
    const bandDlGuide = this.container.querySelector('#btn-band-dl-guide');
    const bandQuickSerial = this.container.querySelector('#btn-band-quick-serial');
    const bandQuickDisconnectSerial = this.container.querySelector('#btn-band-quick-disconnect-serial');
    const bandQuickBle = this.container.querySelector('#btn-band-quick-ble');
    const bandQuickDisconnectBle = this.container.querySelector('#btn-band-quick-disconnect-ble');

    if (bandDlIno) {
      bandDlIno.addEventListener('click', () => {
        sound.playSuccess();
        const code = SerialService.getSampleArduinoCode();
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'AURA_Band_ESP32C3.ino';
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    if (bandCopyIno) {
      bandCopyIno.addEventListener('click', async () => {
        try {
          const code = SerialService.getSampleArduinoCode();
          await navigator.clipboard.writeText(code);
          sound.playSuccess();
          const label = this.container.querySelector('#copy-ino-label');
          if (label) {
            label.textContent = 'Copied to Clipboard!';
            clearTimeout(this.copiedTimeout);
            this.copiedTimeout = setTimeout(() => {
              if (label) label.textContent = 'Copy Sketch';
            }, 2500);
          }
        } catch (e) {
          console.warn('Clipboard write error', e);
        }
      });
    }

    if (bandDlGuide) {
      bandDlGuide.addEventListener('click', () => {
        sound.playSuccess();
        const guideText = `# AURA-OS Astronaut Biosensor Wristband (ESP32-C3)
NASA International Space Apps Challenge 2026

## Bill of Materials
- ESP32-C3 Microcontroller (RISC-V, USB-CDC, BLE 5.0)
- MAX30102 Heart Rate & SpO2 Optical Sensor (I2C 0x57)
- 0.96" SSD1306 OLED Display (I2C 0x3C)
- TP4056 1S BMS Charger & Protection Module
- 3.7V LiPo Battery Cell
- Type-C Female Connector
`;
        const blob = new Blob([guideText], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'AURA_Wristband_Wiring_Guide.md';
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    if (bandQuickSerial) {
      bandQuickSerial.addEventListener('click', async () => {
        try {
          sound.playClick();
          await this.serial.connect(115200);
          sound.playSuccess();
          if (this.onSourceChanged) {
            this.onSourceChanged('USB Serial (ESP32-C3 Band)');
          }
          this.render();
        } catch (err) {
          this.render();
        }
      });
    }

    if (bandQuickDisconnectSerial) {
      bandQuickDisconnectSerial.addEventListener('click', async () => {
        sound.playClick();
        await this.serial.disconnect();
        if (this.onSourceChanged) {
          this.onSourceChanged('Simulated Flight Baseline');
        }
        this.render();
      });
    }

    if (bandQuickBle) {
      bandQuickBle.addEventListener('click', async () => {
        try {
          sound.playClick();
          const deviceName = await this.ble.connect();
          sound.playSuccess();
          if (this.onSourceChanged) {
            this.onSourceChanged(`BLE Band (${deviceName})`);
          }
          this.render();
        } catch (err) {
          this.render();
        }
      });
    }

    if (bandQuickDisconnectBle) {
      bandQuickDisconnectBle.addEventListener('click', () => {
        sound.playClick();
        this.ble.disconnect();
        if (this.onSourceChanged) {
          this.onSourceChanged('Simulated Flight Baseline');
        }
        this.render();
      });
    }

    // --- Serial Tab Actions ---
    const serialConnectBtn = this.container.querySelector('#btn-serial-connect');
    const serialDisconnectBtn = this.container.querySelector('#btn-serial-disconnect');
    const baudSelect = this.container.querySelector('#serial-baud');
    const dlFirmwareBtn = this.container.querySelector('#btn-download-firmware');

    if (serialConnectBtn) {
      serialConnectBtn.addEventListener('click', async () => {
        try {
          sound.playClick();
          const baud = baudSelect ? baudSelect.value : 115200;
          await this.serial.connect(baud);
          sound.playSuccess();
          if (this.onSourceChanged) {
            this.onSourceChanged(`USB Serial (${baud} baud)`);
          }
          this.render();
        } catch (err) {
          this.render();
        }
      });
    }

    if (serialDisconnectBtn) {
      serialDisconnectBtn.addEventListener('click', async () => {
        sound.playClick();
        await this.serial.disconnect();
        if (this.onSourceChanged) {
          this.onSourceChanged('Simulated Flight Baseline');
        }
        this.render();
      });
    }

    if (dlFirmwareBtn) {
      dlFirmwareBtn.addEventListener('click', () => {
        sound.playSuccess();
        const code = SerialService.getSampleArduinoCode();
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'AURA_Band_ESP32C3.ino';
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    // --- BLE Tab Actions ---
    const bleConnectBtn = this.container.querySelector('#btn-ble-connect');
    const bleDisconnectBtn = this.container.querySelector('#btn-ble-disconnect');

    if (bleConnectBtn) {
      bleConnectBtn.addEventListener('click', async () => {
        try {
          sound.playClick();
          const deviceName = await this.ble.connect();
          sound.playSuccess();
          if (this.onSourceChanged) {
            this.onSourceChanged(`Bluetooth Low Energy (${deviceName})`);
          }
          this.render();
        } catch (err) {
          this.render();
        }
      });
    }

    if (bleDisconnectBtn) {
      bleDisconnectBtn.addEventListener('click', () => {
        sound.playClick();
        this.ble.disconnect();
        if (this.onSourceChanged) {
          this.onSourceChanged('Simulated Flight Baseline');
        }
        this.render();
      });
    }

    // --- rPPG Tab Actions ---
    const rppgStartBtn = this.container.querySelector('#btn-rppg-start');
    const rppgStopBtn = this.container.querySelector('#btn-rppg-stop');
    const videoPreview = this.container.querySelector('#rppg-video-preview');

    if (rppgStartBtn) {
      rppgStartBtn.addEventListener('click', async () => {
        try {
          sound.playClick();
          await this.rppg.start(videoPreview);
          sound.playSuccess();
          if (this.onSourceChanged) {
            this.onSourceChanged('Webcam Optical rPPG Pulse Sensor');
          }
          this.render();
        } catch (err) {
          this.render();
        }
      });
    }

    if (rppgStopBtn) {
      rppgStopBtn.addEventListener('click', () => {
        sound.playClick();
        this.rppg.stop(videoPreview);
        if (this.onSourceChanged) {
          this.onSourceChanged('Simulated Flight Baseline');
        }
        this.render();
      });
    }
  }

  logSerial(line) {
    this.serialLogs.push(line);
    if (this.serialLogs.length > 50) this.serialLogs.shift();
    const term = this.container.querySelector('#serial-terminal-output');
    if (term) {
      term.textContent = this.serialLogs.slice(-12).join('\n');
      term.scrollTop = term.scrollHeight;
    }
  }

  updateRppgBpm(bpm) {
    const el = this.container.querySelector('#rppg-bpm-readout');
    if (el) el.textContent = bpm;
  }
}
